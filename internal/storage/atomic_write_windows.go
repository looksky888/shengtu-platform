//go:build windows

package storage

import (
	"os"
	"syscall"
	"unsafe"
)

// replaceFileWindows uses MoveFileExW(MOVEFILE_REPLACE_EXISTING) so dest is never deleted first.
func replaceFileWindows(source, dest string) error {
	from, err := syscall.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	to, err := syscall.UTF16PtrFromString(dest)
	if err != nil {
		return err
	}
	const (
		moveFileReplaceExisting = 0x1
		moveFileWriteThrough    = 0x8
	)
	// kernel32 MoveFileExW
	modkernel32 := syscall.NewLazyDLL("kernel32.dll")
	procMoveFileExW := modkernel32.NewProc("MoveFileExW")
	r1, _, e1 := procMoveFileExW.Call(
		uintptr(unsafe.Pointer(from)),
		uintptr(unsafe.Pointer(to)),
		uintptr(moveFileReplaceExisting|moveFileWriteThrough),
	)
	if r1 == 0 {
		if e1 != nil && e1 != syscall.Errno(0) {
			// Fallback if API unavailable
			return replaceFileFallback(source, dest)
		}
		return os.ErrInvalid
	}
	return nil
}
