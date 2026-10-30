package hostupdate

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

func (m *Manager) setTarget(taskID string, target ReleaseTarget, source ApplicationIdentity) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || m.state.Status != StatusPreflight {
		return
	}
	m.state.Target = &target
	m.state.Source = &source
	m.state.UpdatedAt = nowISO()
	if err := m.saveLocked(); err != nil {
		log.Printf("host updater persist release target failed: %v", err)
	}
}

func (m *Manager) setPhase(taskID, phase string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || !isActiveStatus(m.state.Status) {
		return
	}
	m.state.Phase, m.state.UpdatedAt = phase, nowISO()
	if err := m.saveLocked(); err != nil {
		log.Printf("host updater persist phase failed: %v", err)
	}
}

func (m *Manager) appendCheck(taskID string, check Check) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || !isActiveStatus(m.state.Status) {
		return
	}
	m.state.Checks = append(m.state.Checks, check)
	m.state.UpdatedAt = nowISO()
	if err := m.saveLocked(); err != nil {
		log.Printf("host updater persist check failed: %v", err)
	}
}

func (m *Manager) finish(taskID, status, message string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID {
		return
	}
	now := nowISO()
	m.state.Status, m.state.Phase, m.state.Error = status, "completed", message
	m.state.FinishedAt, m.state.UpdatedAt = now, now
	if err := m.saveLocked(); err != nil {
		log.Printf("host updater persist terminal state failed: %v", err)
	}
}

func (m *Manager) updateTransaction(taskID string, apply func(*UpdateTransaction)) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || !isActiveStatus(m.state.Status) {
		return errors.New("更新事务状态已失效")
	}
	if m.state.Transaction == nil {
		m.state.Transaction = &UpdateTransaction{}
	}
	apply(m.state.Transaction)
	m.state.UpdatedAt = nowISO()
	return m.saveLocked()
}

func (m *Manager) beginRollback(taskID, message string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.TaskID != taskID || (m.state.Status != StatusUpdating && m.state.Status != StatusRollback) {
		return false, nil
	}
	m.state.Status, m.state.Phase, m.state.Error = StatusRollback, "starting_rollback", message
	m.state.UpdatedAt = nowISO()
	if err := m.saveLocked(); err != nil {
		return true, err
	}
	return true, nil
}

func isActiveStatus(status string) bool {
	return status == StatusPreflight || status == StatusUpdating || status == StatusRollback
}

func (m *Manager) load() error {
	data, err := os.ReadFile(filepath.Join(m.opts.StateDir, stateFileName))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read updater state: %w", err)
	}
	if err := json.Unmarshal(data, &m.state); err != nil {
		return fmt.Errorf("decode updater state: %w", err)
	}
	if m.state.Checks == nil {
		m.state.Checks = []Check{}
	}
	return nil
}

func (m *Manager) saveLocked() error {
	data, err := json.MarshalIndent(m.state, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(m.opts.StateDir, ".status-*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(name, filepath.Join(m.opts.StateDir, stateFileName))
}

func cloneState(state State) State {
	if len(state.Checks) == 0 {
		state.Checks = []Check{}
	} else {
		state.Checks = append([]Check(nil), state.Checks...)
	}
	if state.Target != nil {
		target := *state.Target
		state.Target = &target
	}
	if state.Source != nil {
		source := *state.Source
		state.Source = &source
	}
	if state.Transaction != nil {
		transaction := *state.Transaction
		if transaction.Backup != nil {
			backup := *transaction.Backup
			transaction.Backup = &backup
		}
		state.Transaction = &transaction
	}
	return state
}

func nowISO() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func randomID() (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(data[:]), nil
}
