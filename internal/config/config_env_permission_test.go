package config

import (
	"os"
	"runtime"
	"testing"
)

func TestSettingsEnvPermissionNeverWidens(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mode   os.FileMode
		exists bool
		want   os.FileMode
	}{
		{name: "new file", mode: 0, exists: false, want: 0o600},
		{name: "world readable", mode: 0o644, exists: true, want: 0o600},
		{name: "group readable", mode: 0o640, exists: true, want: 0o600},
		{name: "world writable", mode: 0o666, exists: true, want: 0o600},
		{name: "zero mode treated as unset", mode: 0, exists: true, want: 0o600},
		{name: "owner only kept", mode: 0o600, exists: true, want: 0o600},
		{name: "owner read only kept", mode: 0o400, exists: true, want: 0o400},
		{name: "owner rw with exec kept", mode: 0o700, exists: true, want: 0o700},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := settingsEnvPermission(tc.mode, tc.exists); got != tc.want {
				t.Fatalf("settingsEnvPermission(%#o, %v) = %#o, want %#o", tc.mode, tc.exists, got, tc.want)
			}
		})
	}
}

// TestWriteEnvUpdatesNarrowsExistingFileMode pins the end-to-end behaviour on
// platforms that expose POSIX permission bits.
func TestWriteEnvUpdatesNarrowsExistingFileMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows does not expose POSIX permission bits")
	}
	path := t.TempDir() + "/settings.env"
	if err := os.WriteFile(path, []byte("SECRET_KEY=old\n"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	if err := writeEnvUpdates(path, map[string]string{"SECRET_KEY": "new"}); err != nil {
		t.Fatalf("writeEnvUpdates() error = %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("mode = %#o, want 0600 for a secret-bearing settings file", mode)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(data) != "SECRET_KEY=new\n" {
		t.Fatalf("content = %q", string(data))
	}
}
