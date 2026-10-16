import { useCallback } from "react";
import { toast } from "sonner";

import { icloudApi } from "@/lib/icloud-api";

type UseICloudSessionCheckOptions = {
  busy: boolean;
  hasSessions: boolean;
  setBusy: (value: boolean) => void;
  refreshAll: () => Promise<void>;
};

export function useICloudSessionCheck({
  busy,
  hasSessions,
  setBusy,
  refreshAll,
}: UseICloudSessionCheckOptions) {
  return useCallback(async () => {
    if (busy || !hasSessions) return;
    setBusy(true);
    try {
      const result = await icloudApi.checkSession({});
      toast.success(result.message || "登录态检测完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录态检测失败");
    } finally {
      try {
        await refreshAll();
      } finally {
        setBusy(false);
      }
    }
  }, [busy, hasSessions, refreshAll, setBusy]);
}
