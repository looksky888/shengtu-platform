package service

import (
	"encoding/json"
	"os"
	"strings"

	"chatgpt2api/internal/storage"
)

func jsonDocumentStoreFromBackend(backend storage.Backend) storage.JSONDocumentBackend {
	if store, ok := backend.(storage.JSONDocumentBackend); ok {
		return store
	}
	return nil
}

func firstJSONDocumentStore(backends []storage.Backend) storage.JSONDocumentBackend {
	if len(backends) == 0 {
		return nil
	}
	return jsonDocumentStoreFromBackend(backends[0])
}

func creditLedgerStoreFromBackend(backend storage.Backend) storage.CreditLedgerBackend {
	if store, ok := backend.(storage.CreditLedgerBackend); ok {
		return store
	}
	return nil
}

func firstCreditLedgerStore(backends []storage.Backend) storage.CreditLedgerBackend {
	if len(backends) == 0 {
		return nil
	}
	return creditLedgerStoreFromBackend(backends[0])
}

func firstPaymentStore(backends []storage.Backend) storage.PaymentBackend {
	if len(backends) == 0 || backends[0] == nil {
		return nil
	}
	store, _ := backends[0].(storage.PaymentBackend)
	return store
}

func logStoreFromBackend(backend storage.Backend) storage.LogBackend {
	if store, ok := backend.(storage.LogBackend); ok {
		return store
	}
	return nil
}

func firstLogStore(backends []storage.Backend) storage.LogBackend {
	if len(backends) == 0 {
		return nil
	}
	return logStoreFromBackend(backends[0])
}

func usageAggregateStoreFromBackend(backend storage.Backend) storage.UserUsageAggregateBackend {
	if store, ok := backend.(storage.UserUsageAggregateBackend); ok {
		return store
	}
	return nil
}

func loadStoredJSON(store storage.JSONDocumentBackend, name, filePath string) any {
	value, _ := loadStoredJSONWithError(store, name, filePath)
	return value
}

// loadStoredJSONWithError loads a JSON document. Missing data returns (nil, nil).
// Corrupt or unreadable storage returns a non-nil error so callers can refuse writes
// instead of treating the failure as an empty document.
func loadStoredJSONWithError(store storage.JSONDocumentBackend, name, filePath string) (any, error) {
	if store != nil {
		value, err := store.LoadJSONDocument(name)
		if err != nil {
			return nil, err
		}
		if value != nil {
			return value, nil
		}
		// nil,nil means "not found" for document backends — fall through to file path.
	}
	value, err := readJSONValueFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	return value, nil
}

func saveStoredJSON(store storage.JSONDocumentBackend, name, filePath string, value any) error {
	if store != nil {
		return store.SaveJSONDocument(name, value)
	}
	return writeJSONValueFile(filePath, value)
}

func readJSONValueFile(filePath string) (any, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	var raw any
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.UseNumber()
	if err := dec.Decode(&raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func writeJSONValueFile(filePath string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return storage.AtomicWriteFile(filePath, append(data, '\n'), 0o644)
}
