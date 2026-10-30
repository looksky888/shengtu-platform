"use client";

import type {
  CPAPool,
  CPARemoteFile,
  LogCleanupResult,
  LogGovernanceSummary,
  RegisterConfig,
  SettingsConfig,
} from "@/lib/api";

import type { SettingsTabKey } from "./settings-tab-types";

export const PAGE_SIZE_OPTIONS = ["50", "100", "200"] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export type SettingsDataKey = "config" | "register" | "pools" | "logGovernance";

export type SettingsLoadOptions = {
  silent?: boolean;
  signal?: AbortSignal;
};

export type SaveConfigReceipt = {
  restartRequired: boolean;
};

export type SaveConfigSectionOptions = {
  sectionKey?: string;
  silentToast?: boolean;
};

export type SettingsStore = {
  loadedAt: Partial<Record<SettingsDataKey, number>>;
  config: SettingsConfig | null;
  savedConfigSnapshot: string;
  pendingLoginImageFile: File | null;
  pendingLoginImagePreviewUrl: string;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  savingSectionKey: string | null;
  isFetchingImageProxyModels: boolean;
  logGovernance: LogGovernanceSummary | null;
  lastLogCleanup: LogCleanupResult | null;
  isLoadingLogGovernance: boolean;
  isCleaningLogs: boolean;

  registerConfig: RegisterConfig | null;
  savedRegisterSnapshot: string;
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

  loadTabData: (tab: SettingsTabKey) => Promise<void>;
  loadConfig: (options?: SettingsLoadOptions) => Promise<boolean>;
  saveConfig: () => Promise<boolean>;
  saveConfigSection: (
    keys: readonly (keyof SettingsConfig)[],
    options?: SaveConfigSectionOptions
  ) => Promise<SaveConfigReceipt | null>;
  saveLoginPageVisual: (options?: SaveConfigSectionOptions) => Promise<boolean>;
  stageLoginPageImageFile: (file: File | null) => void;
  discardPendingLoginPageImage: () => void;
  resetConfigSection: (keys: readonly (keyof SettingsConfig)[]) => void;
  fetchImageProxyModelOptions: () => Promise<void>;
  setRefreshAccountIntervalMinute: (value: string) => void;
  setImageConcurrentLimit: (value: string) => void;
  setImageWorkerCount: (value: string) => void;
  setImageQueueCapacity: (value: string) => void;
  setVideoWorkerCount: (value: string) => void;
  setVideoQueueCapacity: (value: string) => void;
  setImageAccountConcurrency: (value: string) => void;
  setImageAccountSchedule: (
    value: "least_loaded" | "least_fail" | "quota_aware"
  ) => void;
  setImageTaskTimeoutSeconds: (value: string) => void;
  setImageProxyField: (updates: Partial<SettingsConfig>) => void;
  setLoginPageVisualField: (updates: Partial<SettingsConfig>) => void;
  setImageCreditCost4k: (value: string) => void;
  setImageCreditCost2k: (value: string) => void;
  setImageCreditCost1080p: (value: string) => void;
  setGPTImage2CreditCost: (value: string) => void;
  setGPTImage25CreditCost: (value: string) => void;
  setGPTImage25FlareCreditCost: (value: string) => void;
  setGPTImage25SunburstCreditCost: (value: string) => void;
  setGrokImageCreditCost1k: (value: string) => void;
  setGrokImageCreditCost2k: (value: string) => void;
  setVideoCreditCostPerSecond: (value: string) => void;
  setUserDefaultConcurrentLimit: (value: string) => void;
  setUserDefaultRpmLimit: (value: string) => void;
  setAPIKeyDefaultRpmLimit: (value: string) => void;
  setAPIKeyDefaultConcurrentLimit: (value: string) => void;
  setAPIKeyDailyRequestLimit: (value: string) => void;
  setImageRetentionDays: (value: string) => void;
  setMediaStorageField: (updates: Partial<SettingsConfig>) => void;
  setVideoRetentionDays: (value: string) => void;
  setLogRetentionDays: (value: string) => void;
  setAutoRemoveInvalidAccounts: (value: boolean) => void;
  setAutoRemoveRateLimitedAccounts: (value: boolean) => void;
  setLogLevel: (level: string, enabled: boolean) => void;
  setProxy: (value: string) => void;
  setUpstreamClearanceField: (updates: Partial<SettingsConfig>) => void;
  setCanvasUrl: (value: string) => void;
  setBaseUrl: (value: string) => void;
  setRegistrationEnabled: (value: boolean) => void;
  loadLogGovernance: (options?: SettingsLoadOptions) => Promise<void>;
  cleanupLogsByRetention: (explicitDays?: number) => Promise<void>;

  loadRegister: (options?: SettingsLoadOptions) => Promise<boolean>;
  setRegisterConfig: (config: RegisterConfig) => void;
  setRegisterClearance: (updates: Partial<RegisterConfig["clearance"]>) => void;
  setRegisterProxy: (value: string) => void;
  setRegisterTotal: (value: string) => void;
  setRegisterThreads: (value: string) => void;
  setRegisterMode: (value: "total" | "quota" | "available") => void;
  setRegisterTarget: (value: "openai" | "grok") => void;
  setRegisterTargetQuota: (value: string) => void;
  setRegisterTargetAvailable: (value: string) => void;
  setRegisterCheckInterval: (value: string) => void;
  setRegisterMailField: (
    key: "request_timeout" | "wait_timeout" | "wait_interval",
    value: string
  ) => void;
  setRegisterGrokField: (key: string, value: string | number | boolean) => void;
  addRegisterProvider: () => void;
  updateRegisterProvider: (
    index: number,
    updates: Record<string, unknown>
  ) => void;
  deleteRegisterProvider: (index: number) => void;
  saveRegister: () => Promise<boolean>;
  toggleRegister: () => Promise<void>;
  resetRegister: () => Promise<void>;
  resetOutlookPool: (
    scope: "all" | "failed" | "unused" | "retryable" | "invalid"
  ) => Promise<void>;

  loadPools: (options?: SettingsLoadOptions) => Promise<void>;
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
