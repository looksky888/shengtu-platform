package util

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestToBoolTreatsJSONNumbersAsValues pins the fail-open bug: settings posted as
// JSON numbers (the API decodes with UseNumber, so they arrive as json.Number,
// whose dynamic type is not string) used to fall through to "non-nil, so true".
// Sending {"registration_enabled": 0} therefore switched the flag ON.
func TestToBoolTreatsJSONNumbersAsValues(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   any
		want bool
	}{
		{name: "json number zero", in: json.Number("0"), want: false},
		{name: "json number one", in: json.Number("1"), want: true},
		{name: "json number float zero", in: json.Number("0.0"), want: false},
		{name: "json number malformed", in: json.Number("abc"), want: false},
		{name: "float64 zero", in: float64(0), want: false},
		{name: "float64 one", in: float64(1), want: true},
		{name: "int zero", in: 0, want: false},
		{name: "int one", in: 1, want: true},
		{name: "int64 zero", in: int64(0), want: false},
		{name: "uint64 two", in: uint64(2), want: true},
		{name: "bool true", in: true, want: true},
		{name: "bool false", in: false, want: false},
		{name: "string true", in: "TRUE", want: true},
		{name: "string on", in: " on ", want: true},
		{name: "string off", in: "off", want: false},
		{name: "string zero", in: "0", want: false},
		{name: "nil", in: nil, want: false},
		{name: "unexpected map fails closed", in: map[string]any{"x": 1}, want: false},
		{name: "unexpected slice fails closed", in: []any{1}, want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ToBool(tc.in); got != tc.want {
				t.Fatalf("ToBool(%#v) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

// TestToBoolMatchesJSONDecodedNumbers guards the real wiring: the HTTP helper
// decodes request bodies with UseNumber, so an explicit 0 must arrive as false.
func TestToBoolMatchesJSONDecodedNumbers(t *testing.T) {
	var body map[string]any
	if err := DecodeJSON(strings.NewReader(`{"enabled":0,"verified":1}`), &body); err != nil {
		t.Fatalf("DecodeJSON() error = %v", err)
	}
	if ToBool(body["enabled"]) {
		t.Fatalf("enabled=0 decoded to %#v and ToBool() returned true", body["enabled"])
	}
	if !ToBool(body["verified"]) {
		t.Fatalf("verified=1 decoded to %#v and ToBool() returned false", body["verified"])
	}
}
