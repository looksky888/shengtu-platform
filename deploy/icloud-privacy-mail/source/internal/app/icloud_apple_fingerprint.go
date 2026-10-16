package app

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func appleAccountJSLogEventID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("ipm-%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4],
		b[4:6],
		b[6:8],
		b[8:10],
		b[10:16],
	)
}

func appleAccountFDClientInfo(userAgent string) string {
	info := map[string]string{
		"U": firstNonEmpty(userAgent, appleAccountManageUserAgent),
		"L": appleAccountManageLanguage,
		"Z": appleAccountManageGMTOffset,
		"V": "1.1",
		"F": appleAccountCompressedFingerprint(time.Now()),
	}
	data, _ := json.Marshal(info)
	return string(data)
}

func appleAccountCompressedFingerprint(now time.Time) string {
	raw := appleAccountFingerprintPayload(now.In(time.FixedZone("apple-account", appleAccountManageTZOffset)))
	replaced := raw
	for idx, token := range appleAccountFingerprintDictionary {
		replaced = strings.ReplaceAll(replaced, token, string(rune(idx+1)))
	}
	encoded, ok := appleAccountFingerprintHuffman(replaced)
	if !ok {
		return raw
	}
	checksum := 65535
	for _, b := range []byte(raw) {
		checksum = ((checksum >> 8) | (checksum << 8)) & 0xffff
		checksum ^= int(b) & 0xff
		checksum ^= (checksum & 0xff) >> 4
		checksum ^= (checksum << 12) & 0xffff
		checksum ^= ((checksum & 0xff) << 5) & 0xffff
	}
	return encoded +
		string(appleAccountFingerprintAlphabet[(checksum>>12)&63]) +
		string(appleAccountFingerprintAlphabet[(checksum>>6)&63]) +
		string(appleAccountFingerprintAlphabet[checksum&63])
}

func appleAccountFingerprintPayload(now time.Time) string {
	values := []string{
		"TF1", "020",
	}
	for i := 0; i < 39; i++ {
		values = append(values, "")
	}
	values = append(values,
		"true",
		"true",
		strconv.FormatInt(now.UnixMilli(), 10),
		"-6",
		"6/7/2005, 9:33:44 PM",
		"", "", "", "", "", "",
		strconv.FormatInt(now.UnixMilli(), 10),
		"0",
		appleAccountUSLocaleString(now),
	)
	for i := 0; i < 34; i++ {
		values = append(values, "")
	}
	values = append(values, "5.6.1-0", "")

	var b strings.Builder
	for _, value := range values {
		b.WriteString(appleAccountJSEscape(value))
		b.WriteByte(';')
	}
	return b.String()
}

func appleAccountUSLocaleString(t time.Time) string {
	hour := t.Hour()
	ampm := "AM"
	if hour >= 12 {
		ampm = "PM"
	}
	hour12 := hour % 12
	if hour12 == 0 {
		hour12 = 12
	}
	return fmt.Sprintf("%d/%d/%d, %d:%02d:%02d %s", int(t.Month()), t.Day(), t.Year(), hour12, t.Minute(), t.Second(), ampm)
}

func appleAccountJSEscape(value string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for _, r := range value {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') ||
			r == '@' || r == '*' || r == '_' || r == '+' || r == '-' || r == '.' || r == '/' {
			b.WriteRune(r)
			continue
		}
		if r <= 0xff {
			b.WriteByte('%')
			b.WriteByte(hex[(r>>4)&0xf])
			b.WriteByte(hex[r&0xf])
			continue
		}
		b.WriteString("%u")
		b.WriteByte(hex[(r>>12)&0xf])
		b.WriteByte(hex[(r>>8)&0xf])
		b.WriteByte(hex[(r>>4)&0xf])
		b.WriteByte(hex[r&0xf])
	}
	return b.String()
}

func appleAccountFingerprintHuffman(value string) (string, bool) {
	var b strings.Builder
	bitBuffer := 0
	bitCount := 0
	push := func(width, code int) {
		bitBuffer = (bitBuffer << width) | code
		bitCount += width
		for bitCount >= 6 {
			idx := (bitBuffer >> (bitCount - 6)) & 63
			b.WriteByte(appleAccountFingerprintAlphabet[idx])
			bitCount -= 6
			bitBuffer ^= idx << bitCount
		}
	}
	push(6, (len(value)&7)<<3)
	push(6, (len(value)&56)|1)
	for _, r := range value {
		code, ok := appleAccountFingerprintCodes[int(r)]
		if !ok {
			return "", false
		}
		push(code.width, code.value)
	}
	code := appleAccountFingerprintCodes[0]
	push(code.width, code.value)
	if bitCount > 0 {
		push(6-bitCount, 0)
	}
	return b.String(), true
}

type appleAccountFingerprintCode struct {
	width int
	value int
}

var appleAccountFingerprintDictionary = []string{
	"%20", ";;;", "%3B", "%2C", "und", "fin", "ed;", "%28", "%29", "%3A", "/53", "ike", "Web", "0;", ".0", "e;", "on", "il", "ck", "01", "in", "Mo", "fa", "00", "32", "la", ".1", "ri", "it", "%u", "le",
}

const appleAccountFingerprintAlphabet = ".0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"

var appleAccountFingerprintCodes = map[int]appleAccountFingerprintCode{
	1: {4, 15}, 110: {8, 239}, 74: {8, 238}, 57: {7, 118}, 56: {7, 117}, 71: {8, 233},
	25: {8, 232}, 101: {5, 28}, 104: {7, 111}, 4: {7, 110}, 105: {6, 54}, 5: {7, 107},
	109: {7, 106}, 103: {9, 423}, 82: {9, 422}, 26: {8, 210}, 6: {7, 104}, 46: {6, 51},
	97: {6, 50}, 111: {6, 49}, 7: {7, 97}, 45: {7, 96}, 59: {5, 23}, 15: {7, 91},
	11: {8, 181}, 72: {8, 180}, 27: {8, 179}, 28: {8, 178}, 16: {7, 88}, 88: {10, 703},
	113: {11, 1405}, 89: {12, 2809}, 107: {13, 5617}, 90: {14, 11233}, 42: {15, 22465},
	64: {16, 44929}, 0: {16, 44928}, 81: {9, 350}, 29: {8, 174}, 118: {8, 173}, 30: {8, 172},
	98: {8, 171}, 12: {8, 170}, 99: {7, 84}, 117: {6, 41}, 112: {6, 40}, 102: {9, 319},
	68: {9, 318}, 31: {8, 158}, 100: {7, 78}, 84: {6, 38}, 55: {6, 37}, 17: {7, 73},
	8: {7, 72}, 9: {7, 71}, 77: {7, 70}, 18: {7, 69}, 65: {7, 68}, 48: {6, 33},
	116: {6, 32}, 10: {7, 63}, 121: {8, 125}, 78: {8, 124}, 80: {7, 61}, 69: {7, 60},
	119: {7, 59}, 13: {8, 117}, 79: {8, 116}, 19: {7, 57}, 67: {7, 56}, 114: {6, 27},
	83: {6, 26}, 115: {6, 25}, 14: {6, 24}, 122: {8, 95}, 95: {8, 94}, 76: {7, 46},
	24: {7, 45}, 37: {7, 44}, 50: {5, 10}, 51: {5, 9}, 108: {6, 17}, 22: {7, 33},
	120: {8, 65}, 66: {8, 64}, 21: {7, 31}, 106: {7, 30}, 47: {6, 14}, 53: {5, 6},
	49: {5, 5}, 86: {8, 39}, 85: {8, 38}, 23: {7, 18}, 75: {7, 17}, 20: {7, 16},
	2: {5, 3}, 73: {8, 23}, 43: {9, 45}, 87: {9, 44}, 70: {7, 10}, 3: {6, 4},
	52: {5, 1}, 54: {5, 0},
}
