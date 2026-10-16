package web

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"testing"
)

const webDistManifestPath = "dist/build-manifest.json"

var webSourceRoots = []string{"src", "public", "scripts"}

var webSourceFiles = []string{
	".npmrc",
	"components.json",
	"eslint.config.mjs",
	"index.html",
	"package-lock.json",
	"package.json",
	"postcss.config.mjs",
	"tsconfig.json",
	"vite.config.ts",
}

type webDistManifest struct {
	SchemaVersion int      `json:"schemaVersion"`
	Algorithm     string   `json:"algorithm"`
	SourceHash    string   `json:"sourceHash"`
	Files         []string `json:"files"`
}

func TestEmbeddedWebDistMatchesCurrentSource(t *testing.T) {
	data, err := fs.ReadFile(dist, webDistManifestPath)
	if err != nil {
		t.Fatalf("read embedded web manifest: %v", err)
	}
	var manifest webDistManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("decode embedded web manifest: %v", err)
	}
	if manifest.SchemaVersion != 1 || manifest.Algorithm != "sha256(path\\0content\\0)" {
		t.Fatalf("unsupported embedded web manifest: %#v", manifest)
	}

	webRoot := testWebRoot(t)
	files := collectWebSourceFiles(t, webRoot)
	if !reflect.DeepEqual(manifest.Files, files) {
		t.Fatalf("embedded web manifest file list is stale; run npm run build --prefix web")
	}
	hash := sha256.New()
	for _, relativePath := range files {
		content, err := os.ReadFile(filepath.Join(webRoot, filepath.FromSlash(relativePath)))
		if err != nil {
			t.Fatalf("read web source %s: %v", relativePath, err)
		}
		_, _ = hash.Write([]byte(relativePath))
		_, _ = hash.Write([]byte{0})
		_, _ = hash.Write(content)
		_, _ = hash.Write([]byte{0})
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != manifest.SourceHash {
		t.Fatalf("embedded web dist is stale: got source hash %s, want %s; run npm run build --prefix web", manifest.SourceHash, got)
	}
}

func testWebRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve web dist test file")
	}
	return filepath.Join(filepath.Dir(filename), "..", "..", "web")
}

func collectWebSourceFiles(t *testing.T, webRoot string) []string {
	t.Helper()
	seen := make(map[string]struct{}, len(webSourceFiles))
	for _, relativePath := range webSourceFiles {
		seen[relativePath] = struct{}{}
	}
	for _, root := range webSourceRoots {
		err := filepath.WalkDir(filepath.Join(webRoot, root), func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			relativePath, err := filepath.Rel(webRoot, path)
			if err != nil {
				return err
			}
			seen[filepath.ToSlash(relativePath)] = struct{}{}
			return nil
		})
		if err != nil {
			t.Fatalf("collect web source root %s: %v", root, err)
		}
	}
	files := make([]string, 0, len(seen))
	for relativePath := range seen {
		files = append(files, relativePath)
	}
	sort.Strings(files)
	return files
}
