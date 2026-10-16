//go:build !windows

package main

import (
	"net"
	"os"
	"path/filepath"
)

func listenUpdater() (net.Listener, func(), error) {
	path := envOr("SHENGTU_UPDATER_SOCKET", "/run/shengtu-updater/updater.sock")
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, func() {}, err
	}
	gid := int(envUint64("SHENGTU_UPDATER_SOCKET_GID", 10001))
	if err := os.Chown(dir, -1, gid); err != nil {
		return nil, func() {}, err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return nil, func() {}, err
	}
	listener, err := net.Listen("unix", path)
	if err != nil {
		return nil, func() {}, err
	}
	if err := os.Chmod(path, 0o660); err != nil {
		_ = listener.Close()
		return nil, func() {}, err
	}
	if err := os.Chown(path, -1, gid); err != nil {
		_ = listener.Close()
		return nil, func() {}, err
	}
	return listener, func() { _ = listener.Close(); _ = os.Remove(path) }, nil
}
