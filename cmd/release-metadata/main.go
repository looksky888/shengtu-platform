package main

import (
	"encoding/json"
	"log"
	"os"

	"chatgpt2api/internal/storage"
)

type releaseMetadata struct {
	StorageSchemaVersion   int `json:"storageSchemaVersion"`
	MinSourceSchemaVersion int `json:"minSourceSchemaVersion"`
}

func main() {
	metadata := releaseMetadata{
		StorageSchemaVersion:   storage.SchemaVersion,
		MinSourceSchemaVersion: storage.MinSourceSchemaVersion,
	}
	if err := json.NewEncoder(os.Stdout).Encode(metadata); err != nil {
		log.Fatalf("encode release metadata: %v", err)
	}
}
