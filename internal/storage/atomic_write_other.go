//go:build !windows

package storage

func replaceFileWindows(source, dest string) error {
	return replaceFileFallback(source, dest)
}
