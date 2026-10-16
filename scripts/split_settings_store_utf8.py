# -*- coding: utf-8 -*-
"""UTF-8 safe split of settings/store.ts into normalizers + action slices."""
from pathlib import Path

settings = Path(__file__).resolve().parents[1] / "web" / "src" / "app" / "settings"
store_path = settings / "store.ts"
text = store_path.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)


def find_line(prefix: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if lines[i].lstrip().startswith(prefix):
            return i  # 0-based
    raise SystemExit(f"not found: {prefix}")


# --- 1) Extract normalizers (functions before type SettingsStore) ---
type_idx = find_line("type SettingsStore")
# normalizers start after PAGE_SIZE_OPTIONS / PageSizeOption
page_idx = find_line("export const PAGE_SIZE_OPTIONS")
# functions start after PageSizeOption type
norm_start = page_idx
while norm_start < type_idx and not lines[norm_start].startswith("function "):
    norm_start += 1
norm_body = "".join(lines[norm_start:type_idx])

(settings / "settings-normalizers.ts").write_text(
    "import type { CPARemoteFile, RegisterConfig, SettingsConfig } from \"@/lib/api\";\n"
    "import {\n"
    "  normalizeLoginPageImageMode,\n"
    "  normalizeLoginPageImageTransform,\n"
    "} from \"@/lib/login-page-image-layout\";\n\n"
    + norm_body.replace("function ", "export function ", 1)
    .replace("\nfunction ", "\nexport function "),
    encoding="utf-8",
    newline="\n",
)
# fix: first replace only first; do global for function -> export function carefully
norm_export = norm_body
for name in [
    "normalizeRegisterClearanceConfig",
    "normalizeRegisterConfig",
    "normalizeConfig",
    "normalizeImageProxyMaxRetries",
    "normalizeImageDefaultModel",
    "normalizeImageInternalModelSlug",
    "normalizeImageFallbackModelSlugs",
    "normalizeFiles",
]:
    norm_export = norm_export.replace(f"function {name}", f"export function {name}")
(settings / "settings-normalizers.ts").write_text(
    "import type { CPARemoteFile, RegisterConfig, SettingsConfig } from \"@/lib/api\";\n"
    "import {\n"
    "  normalizeLoginPageImageMode,\n"
    "  normalizeLoginPageImageTransform,\n"
    "} from \"@/lib/login-page-image-layout\";\n\n"
    + norm_export,
    encoding="utf-8",
    newline="\n",
)

# --- 2) Find action implementation blocks inside create(...) ---
create_idx = find_line("export const useSettingsStore")
log_idx = find_line("loadLogGovernance:", create_idx)
register_idx = find_line("loadRegister:", create_idx)
# second loadRegister is impl (first may be type) - type is before create
if log_idx < create_idx:
    log_idx = find_line("loadLogGovernance:", create_idx)
if register_idx < create_idx:
    register_idx = find_line("loadRegister:", create_idx)
# implementations after create:
log_impl_start = None
reg_impl_start = None
cpa_impl_start = None
for i in range(create_idx, len(lines)):
    s = lines[i].lstrip()
    if s.startswith("loadLogGovernance:") and log_impl_start is None:
        log_impl_start = i
    elif s.startswith("loadRegister:") and reg_impl_start is None and log_impl_start is not None:
        reg_impl_start = i
    elif s.startswith("loadPools:") and reg_impl_start is not None and cpa_impl_start is None:
        cpa_impl_start = i
end_create = len(lines) - 1
while end_create > 0 and "}))" not in lines[end_create]:
    end_create -= 1

# log: loadLogGovernance .. before loadRegister
# register: loadRegister .. before loadPools  
# cpa: loadPools .. before }))
log_impl = "".join(lines[log_impl_start:reg_impl_start])
reg_impl = "".join(lines[reg_impl_start:cpa_impl_start])
cpa_impl = "".join(lines[cpa_impl_start:end_create])

# types file from type SettingsStore block
type_end = create_idx
while type_end > type_idx and lines[type_end - 1].strip() != "};":
    type_end -= 1
# include through };
type_block = "".join(lines[type_idx:type_end])

(settings / "settings-store-types.ts").write_text(
    "import type {\n"
    "  CPAPool,\n"
    "  CPARemoteFile,\n"
    "  LogCleanupResult,\n"
    "  LogGovernanceSummary,\n"
    "  RegisterConfig,\n"
    "  SettingsConfig,\n"
    "} from \"@/lib/api\";\n"
    "import type { LoginPageImageMode } from \"@/lib/login-page-image-layout\";\n\n"
    "export const PAGE_SIZE_OPTIONS = [\"50\", \"100\", \"200\"] as const;\n"
    "export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];\n\n"
    + type_block
    + "\nexport type SettingsSet = (\n"
    "  partial: Partial<SettingsStore> | ((state: SettingsStore) => Partial<SettingsStore> | SettingsStore | void),\n"
    ") => void;\n"
    "export type SettingsGet = () => SettingsStore;\n",
    encoding="utf-8",
    newline="\n",
)

(settings / "log-settings-actions.ts").write_text(
    "import { toast } from \"sonner\";\n\n"
    "import { cleanupLogs, fetchLogGovernance } from \"@/lib/api\";\n\n"
    "import type { SettingsGet, SettingsSet } from \"./settings-store-types\";\n\n"
    "export function createLogSettingsActions(set: SettingsSet, get: SettingsGet) {\n"
    "  return {\n"
    + log_impl
    + "  };\n}\n",
    encoding="utf-8",
    newline="\n",
)

(settings / "register-settings-actions.ts").write_text(
    "import { toast } from \"sonner\";\n\n"
    "import {\n"
    "  fetchRegisterConfig,\n"
    "  resetRegister as resetRegisterApi,\n"
    "  startRegister,\n"
    "  stopRegister,\n"
    "  updateRegisterConfig,\n"
    "  type RegisterConfig,\n"
    "} from \"@/lib/api\";\n\n"
    "import {\n"
    "  normalizeRegisterClearanceConfig,\n"
    "  normalizeRegisterConfig,\n"
    "} from \"./settings-normalizers\";\n"
    "import type { SettingsGet, SettingsSet } from \"./settings-store-types\";\n\n"
    "export function createRegisterSettingsActions(set: SettingsSet, get: SettingsGet) {\n"
    "  return {\n"
    + reg_impl
    + "  };\n}\n",
    encoding="utf-8",
    newline="\n",
)

(settings / "cpa-settings-actions.ts").write_text(
    "import { toast } from \"sonner\";\n\n"
    "import {\n"
    "  createCPAPool,\n"
    "  deleteCPAPool,\n"
    "  fetchCPAPoolFiles,\n"
    "  fetchCPAPools,\n"
    "  startCPAImport,\n"
    "  updateCPAPool,\n"
    "} from \"@/lib/api\";\n\n"
    "import { normalizeFiles } from \"./settings-normalizers\";\n"
    "import type { SettingsGet, SettingsSet } from \"./settings-store-types\";\n\n"
    "export function createCPASettingsActions(set: SettingsSet, get: SettingsGet) {\n"
    "  return {\n"
    + cpa_impl
    + "  };\n}\n",
    encoding="utf-8",
    newline="\n",
)

# Rebuild store: keep header imports adjusted + state/core methods until log_impl_start
# Find saveLoginPageImage end = log_impl_start
core_body = "".join(lines[create_idx:log_impl_start])
if not core_body.rstrip().endswith(","):
    core_body = core_body.rstrip() + ",\n"

# Build new imports for store
store_new = (
    "\"use client\";\n\n"
    "import { create } from \"zustand\";\n"
    "import { toast } from \"sonner\";\n\n"
    "import {\n"
    "  fetchImageProxyModels,\n"
    "  fetchSettingsConfig,\n"
    "  updateLoginPageImageSettings,\n"
    "  updateSettingsConfig,\n"
    "  type SettingsConfig,\n"
    "} from \"@/lib/api\";\n"
    "import { dispatchAppMetaUpdated } from \"@/lib/app-meta\";\n"
    "import {\n"
    "  LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM,\n"
    "  normalizeLoginPageImageMode,\n"
    "  normalizeLoginPageImageTransform,\n"
    "  type LoginPageImageMode,\n"
    "} from \"@/lib/login-page-image-layout\";\n\n"
    "import { createCPASettingsActions } from \"./cpa-settings-actions\";\n"
    "import { createLogSettingsActions } from \"./log-settings-actions\";\n"
    "import { createRegisterSettingsActions } from \"./register-settings-actions\";\n"
    "import {\n"
    "  normalizeConfig,\n"
    "  normalizeImageDefaultModel,\n"
    "  normalizeImageFallbackModelSlugs,\n"
    "  normalizeImageInternalModelSlug,\n"
    "  normalizeImageProxyMaxRetries,\n"
    "} from \"./settings-normalizers\";\n"
    "import type { SettingsStore } from \"./settings-store-types\";\n\n"
    "export type { SettingsStore, PageSizeOption } from \"./settings-store-types\";\n"
    "export { PAGE_SIZE_OPTIONS } from \"./settings-store-types\";\n\n"
    + core_body
    + "  ...createLogSettingsActions(set, get),\n"
    + "  ...createRegisterSettingsActions(set, get),\n"
    + "  ...createCPASettingsActions(set, get),\n"
    + "}));\n"
)

# Fix create line: export const useSettingsStore = create<SettingsStore>((set, get) => ({
store_new = store_new.replace(
    "export const useSettingsStore = create<SettingsStore>",
    "export const useSettingsStore = create<SettingsStore>",
)
# Original might be create((set, get) without type if type was local - check
if "create<SettingsStore>" not in store_new and "create((set, get)" in store_new:
    store_new = store_new.replace(
        "export const useSettingsStore = create((set, get) => ({",
        "export const useSettingsStore = create<SettingsStore>((set, get) => ({",
    )

store_path.write_text(store_new, encoding="utf-8", newline="\n")

# Verify Chinese
for p in [
    store_path,
    settings / "log-settings-actions.ts",
    settings / "register-settings-actions.ts",
    settings / "cpa-settings-actions.ts",
]:
    t = p.read_text(encoding="utf-8")
    bad = "\ufffd" in t
    print(p.name, "lines", len(t.splitlines()), "corrupt" if bad else "ok")
    if "失败" in t or "加载" in t:
        print("  has chinese toast strings")
