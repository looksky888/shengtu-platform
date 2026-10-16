//go:build windows

package main

import "net"

func listenUpdater() (net.Listener, func(), error) {
	listener, err := net.Listen("tcp", envOr("SHENGTU_UPDATER_LISTEN_ADDR", "127.0.0.1:18081"))
	if err != nil {
		return nil, func() {}, err
	}
	return listener, func() { _ = listener.Close() }, nil
}
