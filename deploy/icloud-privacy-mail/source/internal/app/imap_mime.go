package app

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"
)

func imapHeaderText(header mail.Header) string {
	var out []string
	for key, values := range header {
		for _, value := range values {
			out = append(out, key+": "+decodeMIMEHeader(value))
		}
	}
	return strings.Join(out, "\n")
}

func decodeMIMEHeader(value string) string {
	decoded, err := new(mime.WordDecoder).DecodeHeader(value)
	if err != nil {
		return strings.TrimSpace(value)
	}
	return strings.TrimSpace(decoded)
}

func decodeICloudIMAPBody(header mail.Header, body []byte) string {
	mediaType, params, err := mime.ParseMediaType(header.Get("Content-Type"))
	if err != nil {
		mediaType = strings.ToLower(strings.TrimSpace(header.Get("Content-Type")))
	}
	decoded := decodeICloudIMAPTransfer(header.Get("Content-Transfer-Encoding"), body)
	if strings.HasPrefix(strings.ToLower(mediaType), "multipart/") {
		boundary := params["boundary"]
		if boundary == "" {
			return string(decoded)
		}
		reader := multipart.NewReader(bytes.NewReader(decoded), boundary)
		var parts []string
		for i := 0; i < 30; i++ {
			part, err := reader.NextPart()
			if err != nil {
				break
			}
			partBody, _ := io.ReadAll(io.LimitReader(part, 1<<20))
			text := decodeICloudIMAPBody(mail.Header(part.Header), partBody)
			if strings.TrimSpace(text) != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n")
	}
	if strings.HasPrefix(strings.ToLower(mediaType), "text/") || mediaType == "" {
		return string(decoded)
	}
	return string(decoded)
}

func decodeICloudIMAPTransfer(encoding string, body []byte) []byte {
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "quoted-printable":
		decoded, err := io.ReadAll(quotedprintable.NewReader(bytes.NewReader(body)))
		if err == nil {
			return decoded
		}
	case "base64":
		decoded, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, bytes.NewReader(body)))
		if err == nil {
			return decoded
		}
	}
	return body
}

func sortMessagesByReceivedAt(messages []ICloudSyncedMessage) {
	for i := 1; i < len(messages); i++ {
		for j := i; j > 0 && messages[j].ReceivedAt.After(messages[j-1].ReceivedAt); j-- {
			messages[j], messages[j-1] = messages[j-1], messages[j]
		}
	}
}
