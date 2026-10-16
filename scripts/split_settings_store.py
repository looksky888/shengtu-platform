"""Extract register/CPA/log action blocks from settings/store.ts into slice modules."""
from pathlib import Path

store_path = Path(__file__).resolve().parents[1] / "web" / "src" / "app" / "settings" / "store.ts"
text = store_path.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)


def body(start: int, end: int) -> str:
    chunk = "".join(lines[start - 1 : end])
    # demote object-literal methods to return-object methods: keep as-is, wrap later
    return chunk


# Implementation ranges from current store.ts
log_impl = body(529, 560)
register_impl = body(562, 730)
cpa_impl = body(732, 921)

# Strip trailing commas on last methods when wrapping — keep commas, object spread handles them.

settings_dir = store_path.parent

(settings_dir / "settings-store-types.ts").write_text(
    '''import type {
  CPAPool,
  CPARemoteFile,
  LogCleanupResult,
  LogGovernanceSummary,
  RegisterConfig,
  SettingsConfig,
} from "@/lib/api";
import type { LoginPageImageMode } from "@/lib/login-page-image-layout";

export const PAGE_SIZE_OPTIONS = ["50", "100", "200"] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export type SettingsStore = {
  config: SettingsConfig | null;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  isFetchingImageProxyModels: boolean;
  logGovernance: LogGovernanceSummary | null;
  lastLogCleanup: LogCleanupResult | null;
  isLoadingLogGovernance: boolean;
  isCleaningLogs: boolean;

  registerConfig: RegisterConfig | null;
  isLoadingRegister: boolean;
  isSavingRegister: boolean;

  pools: CPAPool[];
  isLoadingPools: boolean;
  deletingId: string | null;
  loadingFilesId: string | null;

  dialogOpen: boolean;
  editingPool: CPAPool | null;
  formName: string;
  formBaseUrl: string;
  formSecretKey: string;
  showSecret: boolean;
  isSavingPool: boolean;

  browserOpen: boolean;
  browserPool: CPAPool | null;
  remoteFiles: CPARemoteFile[];
  selectedNames: string[];
  fileQuery: string;
  filePage: number;
  pageSize: PageSizeOption;
  isStartingImport: boolean;

  initialize: () => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  fetchImageProxyModelOptions: () => Promise<void>;
  setRefreshAccountIntervalMinute: (value: string) => void;
  setImageConcurrentLimit: (value: string) => void;
  setImageTaskTimeoutSeconds: (value: string) => void;
  setImageProxyField: (updates: Partial<SettingsConfig>) => void;
  setImageCreditCost4k: (value: string) => void;
  setImageCreditCost2k: (value: string) => void;
  setImageCreditCost1080p: (value: string) => void;
  setUserDefaultConcurrentLimit: (value: string) => void;
  setUserDefaultRpmLimit: (value: string) => void;
  setImageRetentionDays: (value: string) => void;
  setLogRetentionDays: (value: string) => void;
  setAutoRemoveInvalidAccounts: (value: boolean) => void;
  setAutoRemoveRateLimitedAccounts: (value: boolean) => void;
  setLogLevel: (level: string, enabled: boolean) => void;
  setProxy: (value: string) => void;
  setBaseUrl: (value: string) => void;
  setRegistrationEnabled: (value: boolean) => void;
  setLinuxDoEnabled: (value: boolean) => void;
  setLinuxDoClientId: (value: string) => void;
  setLinuxDoClientSecret: (value: string) => void;
  setLinuxDoRedirectUrl: (value: string) => void;
  setLinuxDoFrontendRedirectUrl: (value: string) => void;
  setUpdateRepo: (value: string) => void;
  setUpdateGitHubToken: (value: string) => void;
  setLoginPageImageUrl: (value: string) => void;
  setLoginPageImageMode: (value: LoginPageImageMode) => void;
  setLoginPageImageTransform: (transform: { zoom: number; positionX: number; positionY: number }) => void;
  restoreDefaultLoginPageImage: () => void;
  saveLoginPageImage: (options: { file?: File | null; action: "keep" | "replace" | "remove" }) => Promise<boolean>;
  loadLogGovernance: (silent?: boolean) => Promise<void>;
  cleanupLogsByRetention: () => Promise<void>;

  loadRegister: (silent?: boolean) => Promise<void>;
  setRegisterConfig: (config: RegisterConfig) => void;
  setRegisterClearance: (updates: Partial<RegisterConfig["clearance"]>) => void;
  setRegisterProxy: (value: string) => void;
  setRegisterTotal: (value: string) => void;
  setRegisterThreads: (value: string) => void;
  setRegisterMode: (value: "total" | "quota" | "available") => void;
  setRegisterTargetQuota: (value: string) => void;
  setRegisterTargetAvailable: (value: string) => void;
  setRegisterCheckInterval: (value: string) => void;
  setRegisterMailField: (key: "request_timeout" | "wait_timeout" | "wait_interval", value: string) => void;
  addRegisterProvider: () => void;
  updateRegisterProvider: (index: number, updates: Record<string, unknown>) => void;
  deleteRegisterProvider: (index: number) => void;
  saveRegister: () => Promise<void>;
  toggleRegister: () => Promise<void>;
  resetRegister: () => Promise<void>;

  loadPools: (silent?: boolean) => Promise<void>;
  openAddDialog: () => void;
  openEditDialog: (pool: CPAPool) => void;
  setDialogOpen: (open: boolean) => void;
  setFormName: (value: string) => void;
  setFormBaseUrl: (value: string) => void;
  setFormSecretKey: (value: string) => void;
  setShowSecret: (checked: boolean) => void;
  savePool: () => Promise<void>;
  deletePool: (pool: CPAPool) => Promise<void>;

  browseFiles: (pool: CPAPool) => Promise<void>;
  setBrowserOpen: (open: boolean) => void;
  toggleFile: (name: string, checked: boolean) => void;
  replaceSelectedNames: (names: string[]) => void;
  setFileQuery: (value: string) => void;
  setFilePage: (page: number) => void;
  setPageSize: (value: PageSizeOption) => void;
  startImport: () => Promise<void>;
};

export type SettingsSet = (
  partial: Partial<SettingsStore> | ((state: SettingsStore) => Partial<SettingsStore> | SettingsStore | void),
) => void;
export type SettingsGet = () => SettingsStore;
''',
    encoding="utf-8",
    newline="\n",
)

(settings_dir / "log-settings-actions.ts").write_text(
    f'''import {{ toast }} from "sonner";

import {{ cleanupLogs, fetchLogGovernance }} from "@/lib/api";

import type {{ SettingsGet, SettingsSet }} from "./settings-store-types";

export function createLogSettingsActions(set: SettingsSet, get: SettingsGet) {{
  return {{
{log_impl}  }};
}}
''',
    encoding="utf-8",
    newline="\n",
)

(settings_dir / "register-settings-actions.ts").write_text(
    f'''import {{ toast }} from "sonner";

import {{
  fetchRegisterConfig,
  resetRegister as resetRegisterApi,
  startRegister,
  stopRegister,
  updateRegisterConfig,
  type RegisterConfig,
}} from "@/lib/api";

import {{
  normalizeRegisterClearanceConfig,
  normalizeRegisterConfig,
}} from "./settings-normalizers";
import type {{ SettingsGet, SettingsSet }} from "./settings-store-types";

export function createRegisterSettingsActions(set: SettingsSet, get: SettingsGet) {{
  return {{
{register_impl}  }};
}}
''',
    encoding="utf-8",
    newline="\n",
)

(settings_dir / "cpa-settings-actions.ts").write_text(
    f'''import {{ toast }} from "sonner";

import {{
  createCPAPool,
  deleteCPAPool,
  fetchCPAPoolFiles,
  fetchCPAPools,
  startCPAImport,
  updateCPAPool,
}} from "@/lib/api";

import {{ normalizeFiles }} from "./settings-normalizers";
import type {{ SettingsGet, SettingsSet }} from "./settings-store-types";

export function createCPASettingsActions(set: SettingsSet, get: SettingsGet) {{
  return {{
{cpa_impl}  }};
}}
''',
    encoding="utf-8",
    newline="\n",
)

# Rebuild store.ts: keep imports + create with slices, config actions stay inline (core)
# Keep lines 1-43 imports adjusted, then new structure

core_start = 160  # export const useSettingsStore
# Find end of saveLoginPageImage / before loadLogGovernance (529)
# Keep state + core config methods: 160-527, then spread slices

core_impl = "".join(lines[159:527])  # useSettingsStore start through saveLoginPageImage closing
# core_impl currently is:
# export const useSettingsStore = create<SettingsStore>((set, get) => ({
#   state...
#   initialize...
#   ...
#   saveLoginPageImage...
# });
# We need to change closing to insert spreads before final }));

# Trim trailing whitespace from core - it ends mid-object after saveLoginPageImage
if not core_impl.rstrip().endswith(","):
    # ensure trailing comma before spreads
    core_impl = core_impl.rstrip() + ",\n"

new_store = '''"use client";

import { create } from "zustand";
import { toast } from "sonner";

import {
  fetchImageProxyModels,
  fetchSettingsConfig,
  updateLoginPageImageSettings,
  updateSettingsConfig,
  type SettingsConfig,
} from "@/lib/api";
import { dispatchAppMetaUpdated } from "@/lib/app-meta";
import {
  LOGIN_PAGE_IMAGE_DEFAULT_TRANSFORM,
  normalizeLoginPageImageMode,
  normalizeLoginPageImageTransform,
  type LoginPageImageMode,
} from "@/lib/login-page-image-layout";

import { createCPASettingsActions } from "./cpa-settings-actions";
import { createLogSettingsActions } from "./log-settings-actions";
import { createRegisterSettingsActions } from "./register-settings-actions";
import {
  normalizeConfig,
  normalizeImageDefaultModel,
  normalizeImageFallbackModelSlugs,
  normalizeImageInternalModelSlug,
  normalizeImageProxyMaxRetries,
} from "./settings-normalizers";
import type { SettingsStore } from "./settings-store-types";

export type { SettingsStore, PageSizeOption } from "./settings-store-types";
export { PAGE_SIZE_OPTIONS } from "./settings-store-types";

''' + core_impl + '''
  ...createLogSettingsActions(set, get),
  ...createRegisterSettingsActions(set, get),
  ...createCPASettingsActions(set, get),
}));
'''

# Fix create generic - core_impl already has create<SettingsStore>
# But may still say create<SettingsStore> from old type - ok if we import SettingsStore

store_path.write_text(new_store, encoding="utf-8", newline="\n")
print("store lines", len(new_store.splitlines()))
print("wrote slices")
