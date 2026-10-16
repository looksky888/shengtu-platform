package service

import (
	"fmt"
	"path/filepath"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestQueryManagedUsersPagePagination(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	auth := NewAuthService(backend)
	// Seed two password users.
	if _, err := auth.CreatePasswordUser("alice", "Password123", "Alice", "", true); err != nil {
		t.Fatalf("CreatePasswordUser alice: %v", err)
	}
	if _, err := auth.CreatePasswordUser("bob", "Password123", "Bob", "", true); err != nil {
		t.Fatalf("CreatePasswordUser bob: %v", err)
	}

	page, err := auth.QueryManagedUsersPage(AdminListQuery{Page: 1, PageSize: 1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total < 2 || len(page.Items) != 1 {
		t.Fatalf("page = %#v", page)
	}
	byKW, err := auth.QueryManagedUsersPage(AdminListQuery{Page: 1, PageSize: 20, Keyword: "alice"}, nil)
	if err != nil || byKW.Total < 1 {
		t.Fatalf("keyword = %#v err=%v", byKW, err)
	}
	// Empty page_size defaults to bounded page (not full list); full inventory is ListUsersTyped.
	bounded, err := auth.QueryManagedUsersPage(AdminListQuery{}, nil)
	if err != nil || bounded.Total < 2 || bounded.PageSize != defaultAdminListPageSize {
		t.Fatalf("bounded default = %#v err=%v", bounded, err)
	}
	all := auth.ListUsersTyped()
	if len(all) < 2 {
		t.Fatalf("ListUsersTyped full inventory = %#v", all)
	}
}

func TestQueryManagedUsersPageDefaultsToBoundedProjection(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	auth := NewAuthService(backend)
	for _, username := range []string{"alice", "bob", "charlie"} {
		if _, err := auth.CreatePasswordUser(username, "Password123", username, "", true); err != nil {
			t.Fatalf("CreatePasswordUser %s: %v", username, err)
		}
	}

	page, err := auth.QueryManagedUsersPage(AdminListQuery{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if page.Page != 1 || page.PageSize != defaultAdminListPageSize || page.Total != 3 || len(page.Items) != 3 {
		t.Fatalf("bounded default page = %#v", page)
	}
	filtered, err := auth.QueryManagedUsersPage(AdminListQuery{Page: 1, PageSize: 1, Keyword: "alice"}, nil)
	if err != nil || filtered.Total != 1 || len(filtered.Items) != 1 || filtered.Items[0].Username != "alice" {
		t.Fatalf("filtered page = %#v err=%v", filtered, err)
	}
}

func TestQueryManagedUsersPageProjectsOnlyRequestedPage(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	auth := NewAuthService(backend)
	for i := 0; i < 25; i++ {
		name := fmt.Sprintf("user%02d", i)
		if _, err := auth.CreatePasswordUser(name, "Password123", name, "", true); err != nil {
			t.Fatalf("CreatePasswordUser %s: %v", name, err)
		}
	}
	page, err := auth.QueryManagedUsersPage(AdminListQuery{Page: 2, PageSize: 10}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 25 || page.Page != 2 || page.PageSize != 10 || len(page.Items) != 10 {
		t.Fatalf("page2 = total=%d page=%d size=%d items=%d", page.Total, page.Page, page.PageSize, len(page.Items))
	}
	// Ensure page rows are fully projected (typed fields present).
	for _, item := range page.Items {
		if item.ID == "" || item.Username == "" {
			t.Fatalf("incomplete projection: %#v", item)
		}
	}
}

func TestQueryAccountsPagination(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	svc := NewAccountService(backend, nil, nil, NewLogService(root))
	if !svc.StoreReady() {
		t.Fatal("StoreReady false")
	}
	_ = svc.AddAccounts([]string{"token-aaa-111", "token-bbb-222", "token-ccc-333"})
	// Mark statuses via UpdateAccount if needed.
	page, err := svc.QueryAccounts(AdminListQuery{Page: 1, PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 3 || len(page.Items) != 2 {
		t.Fatalf("page = %#v", page)
	}
}

func TestQueryAccountsTokenKeywordRequiresExplicitOptIn(t *testing.T) {
	root := t.TempDir()
	backend := storage.NewJSONBackend(filepath.Join(root, "accounts.json"), filepath.Join(root, "auth_keys.json"))
	svc := NewAccountService(backend, nil, nil, NewLogService(root))
	_ = svc.AddAccounts([]string{"secret-token-needle"})

	redacted, err := svc.QueryAccounts(AdminListQuery{Keyword: "token-needle"})
	if err != nil {
		t.Fatal(err)
	}
	if redacted.Total != 0 {
		t.Fatalf("token matched without opt-in: %#v", redacted)
	}

	allowed, err := svc.QueryAccounts(AdminListQuery{Keyword: "token-needle", IncludeAccessTokenInKeyword: true})
	if err != nil {
		t.Fatal(err)
	}
	if allowed.Total != 1 || len(allowed.Items) != 1 {
		t.Fatalf("token search with opt-in = %#v", allowed)
	}
}
