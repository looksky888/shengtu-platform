import { useSettingsStore } from "../../settings/store";

export function useRegisterCard() {
  const config = useSettingsStore((state) => state.registerConfig);
  const isLoading = useSettingsStore((state) => state.isLoadingRegister);
  const isSaving = useSettingsStore((state) => state.isSavingRegister);
  const setProxy = useSettingsStore((state) => state.setRegisterProxy);
  const setTotal = useSettingsStore((state) => state.setRegisterTotal);
  const setThreads = useSettingsStore((state) => state.setRegisterThreads);
  const setMode = useSettingsStore((state) => state.setRegisterMode);
  const setTarget = useSettingsStore((state) => state.setRegisterTarget);
  const setTargetQuota = useSettingsStore((state) => state.setRegisterTargetQuota);
  const setTargetAvailable = useSettingsStore((state) => state.setRegisterTargetAvailable);
  const setCheckInterval = useSettingsStore((state) => state.setRegisterCheckInterval);
  const setMailField = useSettingsStore((state) => state.setRegisterMailField);
  const setGrokField = useSettingsStore((state) => state.setRegisterGrokField);
  const setClearance = useSettingsStore((state) => state.setRegisterClearance);
  const addProvider = useSettingsStore((state) => state.addRegisterProvider);
  const updateProvider = useSettingsStore((state) => state.updateRegisterProvider);
  const deleteProvider = useSettingsStore((state) => state.deleteRegisterProvider);
  const save = useSettingsStore((state) => state.saveRegister);
  const toggle = useSettingsStore((state) => state.toggleRegister);
  const reset = useSettingsStore((state) => state.resetRegister);
  const stats = config?.stats || { success: 0, fail: 0, done: 0, running: 0, threads: config?.threads || 0 };
  const providers = config?.mail.providers || [];
  const logs = config?.logs || [];

  const resetOutlookPool = useSettingsStore((state) => state.resetOutlookPool);

  const updateProviderType = (index: number, type: string) => {
    updateProvider(index, {
      type,
      enable: true,
      ...(type === "cloudflare_temp_email" ? { api_base: "", admin_password: "", domain: [] } : {}),
      ...(type === "tempmail_lol" ? { api_key: "", domain: [] } : {}),
      ...(type === "duckmail" ? { api_key: "", default_domain: "duckmail.sbs" } : {}),
      ...(type === "gptmail" ? { api_key: "", default_domain: "" } : {}),
      ...(type === "moemail" ? { api_base: "", api_key: "", domain: [], expiry_time: 0 } : {}),
      ...(type === "outlook_token"
        ? { mailboxes: "", mode: "auto", message_limit: 10, imap_host: "outlook.office365.com" }
        : {}),
      ...(type === "icloud_local"
        ? { api_base: "", project: "openai", purpose: "register", keyword: "OpenAI", wait_ms: 12000 }
        : {}),
      ...(type === "icloud_api"
        ? { api_base: "", api_key: "", project: "openai", purpose: "register", keyword: "OpenAI", wait_ms: 12000 }
        : {}),
    });
  };

  return {
    config, isLoading, isSaving, stats, providers, logs, setProxy, setTotal, setThreads, setMode, setTarget,
    setTargetQuota, setTargetAvailable, setCheckInterval, setMailField, setGrokField, setClearance, addProvider,
    updateProvider, deleteProvider, save, toggle, reset, updateProviderType, resetOutlookPool,
  };
}

export type RegisterCardState = ReturnType<typeof useRegisterCard>;