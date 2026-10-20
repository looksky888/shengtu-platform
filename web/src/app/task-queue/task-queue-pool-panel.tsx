"use client";

import { useState } from "react";
import { toast } from "sonner";

import { formatMailboxAPICopyText } from "@/app/icloud/icloud-mailbox-copy";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  purgePermanentQuarantineAccount,
  purgeAllPermanentQuarantineAccounts,
  restoreQuarantineAccount,
  type AccountPoolHealth,
  type QuarantineItem,
} from "@/lib/api";
import { icloudApi } from "@/lib/icloud-api";

import { QuarantineICloudAPIDialog } from "./quarantine-icloud-api-dialog";
import { matchPermanentQuarantineMailboxAPIs } from "./quarantine-icloud-api-match";
import { QuarantinePurgeDialog } from "./quarantine-purge-dialog";
import { TaskQueuePoolHealthCard } from "./task-queue-pool-health-card";
import { TaskQueueQuarantineCard } from "./task-queue-quarantine-card";

type TaskQueuePoolPanelProps = {
  pool: AccountPoolHealth | null;
  quarantine: QuarantineItem[];
  temporaryCount?: number;
  permanentCount?: number;
  onChanged: () => void;
};

export function TaskQueuePoolPanel({
  pool,
  quarantine,
  temporaryCount: temporaryCountProp,
  permanentCount: permanentCountProp,
  onChanged,
}: TaskQueuePoolPanelProps) {
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<QuarantineItem | null>(null);
  const [confirmPurgeAllOpen, setConfirmPurgeAllOpen] = useState(false);
  const [matchingICloudAPIs, setMatchingICloudAPIs] = useState(false);
  const [iCloudMatchResult, setICloudMatchResult] = useState<Awaited<ReturnType<typeof matchPermanentQuarantineMailboxAPIs>> | null>(null);
  const [purgingAll, setPurgingAll] = useState(false);
  const temporaryCount = temporaryCountProp ?? quarantine.filter((item) => item.grade === "temporary").length;
  const permanentCount = permanentCountProp ?? quarantine.filter((item) => item.grade === "permanent").length;

  const handleRestore = async (item: QuarantineItem) => {
    if (!item.token_hash) return;
    setBusyHash(item.token_hash);
    try {
      const result = await restoreQuarantineAccount(item.token_hash);
      if (result.restored) {
        toast.success(item.grade === "permanent" ? "已尝试恢复到号池（永久死号可能仍 401）" : "已恢复到号池");
        onChanged();
      } else {
        toast.error(result.error || "恢复失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setBusyHash(null);
    }
  };

  const handlePurgeConfirm = async () => {
    const item = confirmPurge;
    if (!item?.token_hash) return;
    setBusyHash(item.token_hash);
    try {
      const result = await purgePermanentQuarantineAccount(item.token_hash);
      if (result.purged) {
        toast.success("已从永久隔离仓删除");
        setConfirmPurge(null);
        onChanged();
      } else {
        toast.error(result.error || "删除失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusyHash(null);
    }
  };

  const handleMatchICloudAPIs = async () => {
    if (matchingICloudAPIs || permanentCount === 0) return;
    setMatchingICloudAPIs(true);
    setICloudMatchResult(null);
    try {
      const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
      const result = await matchPermanentQuarantineMailboxAPIs(
        quarantine,
        origin,
        icloudApi.lookupMailboxes,
        formatMailboxAPICopyText,
      );
      setICloudMatchResult(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "匹配 iCloud API 失败");
    } finally {
      setMatchingICloudAPIs(false);
    }
  };

  const handlePurgeAllPermanent = async () => {
    if (purgingAll || permanentCount === 0) return;
    setPurgingAll(true);
    try {
      const result = await purgeAllPermanentQuarantineAccounts();
      setConfirmPurgeAllOpen(false);
      if (result.errors?.length && result.purged === 0) {
        toast.error(`批量删除失败：${result.errors[0]}`);
        onChanged();
        return;
      }
      if (result.failed > 0) {
        toast.warning(`已删除 ${result.purged} 条，${result.failed} 条删除失败并保留在隔离仓`);
      } else {
        toast.success(`已删除全部 ${result.purged} 条永久隔离记录`);
      }
      setICloudMatchResult(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setPurgingAll(false);
    }
  };

  return (
    <div className="space-y-3">
      <TaskQueuePoolHealthCard pool={pool} />
      <TaskQueueQuarantineCard
        items={quarantine}
        temporaryCount={temporaryCount}
        permanentCount={permanentCount}
        busyHash={busyHash}
        onRestore={handleRestore}
        onPurge={setConfirmPurge}
        onMatchICloudAPIs={() => void handleMatchICloudAPIs()}
        matchingICloudAPIs={matchingICloudAPIs}
      />
      <QuarantinePurgeDialog
        item={confirmPurge}
        busy={Boolean(confirmPurge?.token_hash && busyHash === confirmPurge.token_hash)}
        onCancel={() => setConfirmPurge(null)}
        onConfirm={handlePurgeConfirm}
      />
      <QuarantineICloudAPIDialog
        open={Boolean(iCloudMatchResult)}
        result={iCloudMatchResult}
        busy={purgingAll}
        onPurgeAll={() => setConfirmPurgeAllOpen(true)}
        onClose={() => setICloudMatchResult(null)}
      />
      <ConfirmDialog
        open={confirmPurgeAllOpen}
        title={`确认删除全部 ${permanentCount} 条永久隔离记录？`}
        description="此操作不可恢复，也不会将这些账号重新导入号池。"
        confirmLabel="确认删除全部"
        destructive
        pending={purgingAll}
        onClose={() => setConfirmPurgeAllOpen(false)}
        onConfirm={() => void handlePurgeAllPermanent()}
      />
    </div>
  );
}
