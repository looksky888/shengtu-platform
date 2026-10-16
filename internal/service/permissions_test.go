package service

import "testing"

func TestNormalizeAPIPermissionsMigratesCreationTaskPermissions(t *testing.T) {
	permissions := NormalizeAPIPermissions([]string{
		APIPermissionKey("GET", "/api/image-tasks"),
		"POST /api/image-tasks",
	})

	if !HasAPIPermission(PermissionSet{APIPermissions: permissions}, "GET", "/api/creation-tasks") {
		t.Fatalf("migrated permissions missing creation task read: %#v", permissions)
	}
	if !HasAPIPermission(PermissionSet{APIPermissions: permissions}, "POST", "/api/creation-tasks/chat-completions") {
		t.Fatalf("migrated permissions missing creation task submit subtree: %#v", permissions)
	}
	if HasAPIPermission(PermissionSet{APIPermissions: permissions}, "GET", "/api/image-tasks") {
		t.Fatalf("old image task route should not be authorized: %#v", permissions)
	}
}

func TestAccountPoolPermissionsAreExplicit(t *testing.T) {
	readOnly := PermissionSet{APIPermissions: []string{APIPermissionKey("GET", "/api/accounts")}}
	if !HasAPIPermission(readOnly, "GET", "/api/accounts") {
		t.Fatalf("read-only account permission missing account list")
	}
	if HasAPIPermission(readOnly, "GET", "/api/accounts/tokens") {
		t.Fatalf("account list permission should not allow token export")
	}
	if HasAPIPermission(readOnly, "POST", "/api/accounts/refresh") {
		t.Fatalf("account list permission should not allow refresh")
	}

	operators := PermissionSet{APIPermissions: NormalizeAPIPermissions([]string{
		APIPermissionKey("GET", "/api/accounts/tokens"),
		APIPermissionKey("POST", "/api/accounts"),
		APIPermissionKey("POST", "/api/accounts/refresh"),
		APIPermissionKey("POST", "/api/accounts/update"),
		APIPermissionKey("DELETE", "/api/accounts"),
	})}
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/accounts/tokens"},
		{"POST", "/api/accounts"},
		{"POST", "/api/accounts/refresh"},
		{"POST", "/api/accounts/update"},
		{"DELETE", "/api/accounts"},
	} {
		if !HasAPIPermission(operators, tc.method, tc.path) {
			t.Fatalf("missing explicit permission for %s %s in %#v", tc.method, tc.path, operators.APIPermissions)
		}
	}
}

func TestDefaultUserCanReadModelCatalog(t *testing.T) {
	permissions := DefaultPermissionSetForRole(AuthRoleUser)
	if !HasAPIPermission(permissions, "GET", "/api/model-catalog") {
		t.Fatalf("default user permissions missing model catalog: %#v", permissions.APIPermissions)
	}
	if !HasAPIPermission(permissions, "POST", "/api/creation-tasks/video-generations") {
		t.Fatalf("default user permissions missing video task submit: %#v", permissions.APIPermissions)
	}
	if !HasAPIPermission(permissions, "GET", "/api/videos/task-1/content") {
		t.Fatalf("default user permissions missing video content read: %#v", permissions.APIPermissions)
	}
	for _, test := range []struct{ method, path string }{
		{"GET", "/api/video-reference-assets"},
		{"GET", "/api/video-reference-assets/asset-1/content"},
		{"POST", "/api/video-reference-assets"},
		{"DELETE", "/api/video-reference-assets/asset-1"},
	} {
		if !HasAPIPermission(permissions, test.method, test.path) {
			t.Fatalf("default user permissions missing %s %s: %#v", test.method, test.path, permissions.APIPermissions)
		}
	}
	videoMenuFound := false
	rechargeMenuFound := false
	for _, path := range permissions.MenuPaths {
		videoMenuFound = videoMenuFound || path == "/video"
		rechargeMenuFound = rechargeMenuFound || path == "/recharge"
	}
	if !videoMenuFound {
		t.Fatalf("default user permissions missing video menu: %#v", permissions.MenuPaths)
	}
	if !rechargeMenuFound || !HasAPIPermission(permissions, "GET", "/api/payment/settings") || !HasAPIPermission(permissions, "GET", "/api/payment/channels") || !HasAPIPermission(permissions, "GET", "/api/payment/storage-entitlement") {
		t.Fatalf("default user permissions missing recharge center: %#v %#v", permissions.MenuPaths, permissions.APIPermissions)
	}
}

func TestImageChannelPermissionsCoverNestedModelRoutes(t *testing.T) {
	permissions := PermissionSet{APIPermissions: NormalizeAPIPermissions([]string{
		APIPermissionKey("GET", "/api/admin/image-channels"),
		APIPermissionKey("POST", "/api/admin/image-channels"),
		APIPermissionKey("PUT", "/api/admin/image-channels"),
		APIPermissionKey("DELETE", "/api/admin/image-channels"),
	})}
	for _, test := range []struct{ method, path string }{
		{"GET", "/api/admin/image-channels/channel-1/models"},
		{"POST", "/api/admin/image-channels/channel-1/discover"},
		{"PUT", "/api/admin/image-channels/channel-1/models/model-1"},
		{"DELETE", "/api/admin/image-channels/channel-1/models/model-1"},
	} {
		if !HasAPIPermission(permissions, test.method, test.path) {
			t.Fatalf("missing image channel permission for %s %s", test.method, test.path)
		}
	}
	if HasAPIPermission(permissions, "PATCH", "/api/admin/image-channels/channel-1") {
		t.Fatal("ungranted PATCH image channel permission should remain denied")
	}
}

func TestNormalizeManagedRoleAPIPermissionsBackfillsStorageEntitlement(t *testing.T) {
	permissions := NormalizeManagedRoleAPIPermissions([]string{
		APIPermissionKey("GET", "/api/payment/settings"),
	})
	if !HasAPIPermission(PermissionSet{APIPermissions: permissions}, "GET", "/api/payment/storage-entitlement") {
		t.Fatalf("recharge role missing storage entitlement read permission: %#v", permissions)
	}

	permissions = NormalizeManagedRoleAPIPermissions([]string{
		APIPermissionKey("GET", "/api/images"),
	})
	if HasAPIPermission(PermissionSet{APIPermissions: permissions}, "GET", "/api/payment/storage-entitlement") {
		t.Fatalf("unrelated role received storage entitlement read permission: %#v", permissions)
	}
}
