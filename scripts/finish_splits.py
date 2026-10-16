# -*- coding: utf-8 -*-
"""Batch-split remaining large Go files. Behavior-preserving file moves only."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def lines_of(rel: str) -> list[str]:
    return (ROOT / rel).read_text(encoding="utf-8").splitlines(keepends=True)


def body(ls: list[str], start: int, end: int) -> str:
    return "".join(ls[start - 1 : end])


def write(rel: str, content: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if not content.endswith("\n"):
        content += "\n"
    path.write_text(content, encoding="utf-8", newline="\n")
    print(f"wrote {rel} ({len(content.splitlines())} lines)")


def split_package(rel: str, parts: list[tuple[str, int, int, str]], keep_ranges: list[tuple[int, int]], keep_header: str) -> None:
    """parts: (filename, start, end, header). keep_ranges stay in original file with keep_header."""
    ls = lines_of(rel)
    base = Path(rel).parent
    for name, start, end, header in parts:
        write(str(base / name), header + body(ls, start, end))
    kept = keep_header + "".join(body(ls, s, e) for s, e in keep_ranges)
    write(rel, kept)


# ---------- httpapi/routes.go ----------
routes = lines_of("internal/httpapi/routes.go")
# detect package imports from original
routes_import_end = 0
for i, line in enumerate(routes):
    if line.startswith("func "):
        routes_import_end = i
        break
routes_header_base = "".join(routes[:routes_import_end])

# Ensure each split file has full imports - use original header for all
def routes_header(extra: str = "") -> str:
    return routes_header_base

# Use goimports later; include generous imports in each file
common_routes_header = '''package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

'''

routes_parts = [
    ("routes_profile.go", 14, 584, common_routes_header),
    ("routes_admin_users.go", 585, 924, common_routes_header),
    ("routes_accounts.go", 925, 1066, common_routes_header),
    ("routes_cpa.go", 1067, 1147, common_routes_header),
    ("routes_tasks.go", 1148, 1353, common_routes_header),
    ("routes_register.go", 1354, 1449, common_routes_header),
]
# routes.go becomes empty package file with comment - or delete content
# Keep a tiny routes.go note
write(
    "internal/httpapi/routes.go",
    "// Package httpapi route handlers are split across routes_*.go files.\n"
    "package httpapi\n",
)
for name, start, end, header in routes_parts:
    write(f"internal/httpapi/{name}", header + body(routes, start, end))

# ---------- service/auth.go ----------
auth = lines_of("internal/service/auth.go")
auth_header = '''package service

import (
	"crypto/hmac"
	"sort"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

'''
# Keep core types + service + list/auth in auth.go
# roles: CreateRole..PermissionCatalog 193-344? ListRoles starts 193
# Actually:
# 29-135 types + New + rebuild + ListKeys single/personal
# Keep 1-end of Authenticate and save helpers in auth.go
# Split:
# auth_roles.go: ListRoles through PermissionCatalog (193-344)
# auth_credentials.go: CreateAPIKey through RevealUserAPIKey (345-830)
# auth_helpers.go: load through end helpers (880-end) but keep Authenticate in auth.go

write("internal/service/auth_roles.go", auth_header + body(auth, 193, 344))
write("internal/service/auth_credentials.go", auth_header + body(auth, 345, 830))
write("internal/service/auth_helpers.go", auth_header + body(auth, 880, len(auth)))
# auth.go keeps types + New + list keys/users + Authenticate + save methods that credentials need
# Authenticate is 831-879, save is 916+ moved to helpers - credentials call saveLocked which is in helpers - ok same package
write(
    "internal/service/auth.go",
    auth_header + body(auth, 29, 192) + body(auth, 831, 879),
)

# ---------- protocol/api.go ----------
api = lines_of("internal/protocol/api.go")
api_header = '''package protocol

import (
	"context"
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"
	"time"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/util"
)

'''
# 17-131 images + stream chunks
# 133-495 chat
# 496-934 responses  
# 935-end messages/anthropic
write("internal/protocol/api_images.go", api_header + body(api, 17, 131))
write("internal/protocol/api_chat.go", api_header + body(api, 133, 495))
write("internal/protocol/api_responses.go", api_header + body(api, 496, 934))
write("internal/protocol/api_messages.go", api_header + body(api, 935, len(api)))
write(
    "internal/protocol/api.go",
    "// OpenAI/Anthropic protocol adapters are split across api_*.go files.\npackage protocol\n",
)

# ---------- backend/backend.go ----------
be = lines_of("internal/backend/backend.go")
be_header = '''package backend

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math/rand"
	"mime"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

'''
# 48-357 client core stream
# 358-486 fingerprint
# 487-802 headers/bootstrap/conversation
# 803-1022 image gen/upload/poll
# 1023-end helpers
write("internal/backend/client.go", be_header + body(be, 48, 357))
write("internal/backend/fingerprint.go", be_header + body(be, 358, 486))
write("internal/backend/headers.go", be_header + body(be, 487, 802))
write("internal/backend/image_client.go", be_header + body(be, 803, 1022))
write("internal/backend/http_helpers.go", be_header + body(be, 1023, len(be)))
write(
    "internal/backend/backend.go",
    "// ChatGPT web client is split across client.go, fingerprint.go, headers.go, image_client.go, http_helpers.go.\n"
    "package backend\n",
)

print("split batch done")
