//go:build !windows

package hostupdate

import (
	"fmt"
	"syscall"
)

func diskFreeBytes(path string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, fmt.Errorf("读取磁盘空间: %w", err)
	}
	return stat.Bavail * uint64(stat.Bsize), nil
}
