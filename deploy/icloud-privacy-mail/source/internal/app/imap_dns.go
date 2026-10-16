package app

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"
)

func lookupICloudIMAPIPv4(ctx context.Context, host string) ([]net.IP, error) {
	host = strings.TrimSuffix(strings.TrimSpace(host), ".")
	if host == "" {
		return nil, errors.New("empty host")
	}
	var messages []string
	seen := make(map[string]struct{})
	var out []net.IP
	for _, server := range iCloudIMAPDNSServers {
		server = strings.TrimSpace(server)
		if server == "" {
			continue
		}
		ips, err := lookupDNSAOverTCP(ctx, server, host)
		if err != nil {
			messages = append(messages, server+": "+err.Error())
			continue
		}
		for _, ip := range ips {
			if ip == nil || ip.To4() == nil {
				continue
			}
			key := ip.String()
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, ip)
		}
		if len(out) > 0 {
			return out, nil
		}
	}
	if len(messages) == 0 {
		return nil, errors.New("no DNS servers configured")
	}
	return nil, errors.New(strings.Join(messages, "; "))
}

func lookupDNSAOverTCP(ctx context.Context, server, host string) ([]net.IP, error) {
	queryID := uint16(time.Now().UnixNano())
	query, err := dnsBuildAQuery(host, queryID)
	if err != nil {
		return nil, err
	}
	dialer := net.Dialer{Timeout: 3 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp4", server)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	prefix := make([]byte, 2)
	binary.BigEndian.PutUint16(prefix, uint16(len(query)))
	if _, err := conn.Write(prefix); err != nil {
		return nil, err
	}
	if _, err := conn.Write(query); err != nil {
		return nil, err
	}
	if _, err := io.ReadFull(conn, prefix); err != nil {
		return nil, err
	}
	size := int(binary.BigEndian.Uint16(prefix))
	if size <= 0 || size > 65535 {
		return nil, fmt.Errorf("invalid DNS response size %d", size)
	}
	response := make([]byte, size)
	if _, err := io.ReadFull(conn, response); err != nil {
		return nil, err
	}
	return dnsParseAResponse(response, queryID)
}

func dnsBuildAQuery(host string, id uint16) ([]byte, error) {
	host = strings.TrimSuffix(strings.TrimSpace(host), ".")
	if host == "" {
		return nil, errors.New("empty DNS host")
	}
	buf := make([]byte, 12, 64)
	binary.BigEndian.PutUint16(buf[0:2], id)
	binary.BigEndian.PutUint16(buf[2:4], 0x0100)
	binary.BigEndian.PutUint16(buf[4:6], 1)
	for _, label := range strings.Split(host, ".") {
		if label == "" {
			return nil, fmt.Errorf("invalid empty DNS label in %q", host)
		}
		if len(label) > 63 {
			return nil, fmt.Errorf("DNS label too long in %q", host)
		}
		buf = append(buf, byte(len(label)))
		buf = append(buf, label...)
	}
	buf = append(buf, 0)
	buf = binary.BigEndian.AppendUint16(buf, 1)
	buf = binary.BigEndian.AppendUint16(buf, 1)
	return buf, nil
}

func dnsParseAResponse(message []byte, id uint16) ([]net.IP, error) {
	if len(message) < 12 {
		return nil, errors.New("short DNS response")
	}
	if binary.BigEndian.Uint16(message[0:2]) != id {
		return nil, errors.New("DNS response id mismatch")
	}
	flags := binary.BigEndian.Uint16(message[2:4])
	if flags&0x000f != 0 {
		return nil, fmt.Errorf("DNS response rcode %d", flags&0x000f)
	}
	qdCount := int(binary.BigEndian.Uint16(message[4:6]))
	anCount := int(binary.BigEndian.Uint16(message[6:8]))
	offset := 12
	var err error
	for i := 0; i < qdCount; i++ {
		offset, err = dnsSkipName(message, offset)
		if err != nil {
			return nil, err
		}
		if offset+4 > len(message) {
			return nil, errors.New("short DNS question")
		}
		offset += 4
	}
	var out []net.IP
	for i := 0; i < anCount; i++ {
		offset, err = dnsSkipName(message, offset)
		if err != nil {
			return nil, err
		}
		if offset+10 > len(message) {
			return nil, errors.New("short DNS answer")
		}
		recordType := binary.BigEndian.Uint16(message[offset : offset+2])
		recordClass := binary.BigEndian.Uint16(message[offset+2 : offset+4])
		rdLength := int(binary.BigEndian.Uint16(message[offset+8 : offset+10]))
		offset += 10
		if offset+rdLength > len(message) {
			return nil, errors.New("short DNS rdata")
		}
		if recordType == 1 && recordClass == 1 && rdLength == 4 {
			out = append(out, net.IPv4(message[offset], message[offset+1], message[offset+2], message[offset+3]))
		}
		offset += rdLength
	}
	if len(out) == 0 {
		return nil, errors.New("DNS response has no A records")
	}
	return out, nil
}

func dnsSkipName(message []byte, offset int) (int, error) {
	for jumps := 0; ; jumps++ {
		if jumps > 128 {
			return 0, errors.New("DNS name compression loop")
		}
		if offset >= len(message) {
			return 0, errors.New("short DNS name")
		}
		length := int(message[offset])
		if length&0xc0 == 0xc0 {
			if offset+1 >= len(message) {
				return 0, errors.New("short DNS compression pointer")
			}
			return offset + 2, nil
		}
		if length&0xc0 != 0 {
			return 0, errors.New("invalid DNS label")
		}
		offset++
		if length == 0 {
			return offset, nil
		}
		if offset+length > len(message) {
			return 0, errors.New("short DNS label")
		}
		offset += length
	}
}

func dnsFallbackNetworks(network string) []string {
	switch strings.ToLower(strings.TrimSpace(network)) {
	case "udp", "udp4", "udp6":
		return []string{"tcp", "udp"}
	case "tcp", "tcp4", "tcp6":
		return []string{"tcp", "udp"}
	case "":
		return []string{"tcp", "udp"}
	default:
		return []string{network, "udp", "tcp"}
	}
}
