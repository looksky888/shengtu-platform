package hostupdate

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReplaceFileReportsRestoreFailure(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	target := filepath.Join(root, "target")
	if err := os.WriteFile(source, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	call := 0
	rename := func(oldPath, newPath string) error {
		call++
		switch call {
		case 1:
			return errors.New("replace blocked")
		case 2:
			return os.Rename(oldPath, newPath)
		case 3:
			return errors.New("install failed")
		default:
			return errors.New("restore failed")
		}
	}

	err := replaceFileWithRename(source, target, rename)
	if err == nil || !strings.Contains(err.Error(), "install failed") || !strings.Contains(err.Error(), "恢复原文件失败") || !strings.Contains(err.Error(), "restore failed") {
		t.Fatalf("replaceFileWithRename() error = %v", err)
	}
}
