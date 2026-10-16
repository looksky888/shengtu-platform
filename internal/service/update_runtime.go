package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

func executablePath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("获取可执行文件路径失败: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(exePath)
	if err != nil {
		return "", fmt.Errorf("解析可执行文件路径失败: %w", err)
	}
	return resolved, nil
}

func replaceRuntimeFiles(exePath, newBinaryPath string) error {
	exeBackup := exePath + ".backup"
	_ = os.Remove(exeBackup)
	if err := os.Rename(exePath, exeBackup); err != nil {
		return fmt.Errorf("备份可执行文件失败: %w", err)
	}
	binaryReplaced := false
	defer func() {
		if !binaryReplaced {
			_ = os.Rename(exeBackup, exePath)
		}
	}()
	if err := os.Rename(newBinaryPath, exePath); err != nil {
		return fmt.Errorf("替换可执行文件失败: %w", err)
	}
	binaryReplaced = true
	return nil
}

func rollbackRuntimeFiles(exePath string) error {
	exeBackup := exePath + ".backup"
	if _, err := os.Stat(exeBackup); err != nil {
		if os.IsNotExist(err) {
			return errors.New("未找到可执行文件备份")
		}
		return err
	}
	currentBackup := exePath + ".rollback-current"
	_ = os.Remove(currentBackup)
	if err := os.Rename(exePath, currentBackup); err != nil {
		return fmt.Errorf("备份当前可执行文件失败: %w", err)
	}
	if err := os.Rename(exeBackup, exePath); err != nil {
		_ = os.Rename(currentBackup, exePath)
		return fmt.Errorf("恢复可执行文件备份失败: %w", err)
	}
	_ = os.Remove(currentBackup)
	return nil
}
