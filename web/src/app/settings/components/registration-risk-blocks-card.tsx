"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteRegistrationRiskBlock,
  fetchRegistrationRiskBlocks,
  type RegistrationRiskBlock,
} from "@/lib/api";

import { SettingsCard, SettingsEmptyState, settingsListItemClassName } from "./settings-ui";

const kindLabels: Record<string, string> = { device: "设备", ip: "IP", ip_device: "IP＋设备" };

export function RegistrationRiskBlocksCard() {
  const [items, setItems] = useState<RegistrationRiskBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRegistrationRiskBlocks();
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载封禁记录失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (item: RegistrationRiskBlock) => {
    setDeleting(item.id);
    try {
      await deleteRegistrationRiskBlock(item.id);
      setItems((current) => current.filter((value) => value.id !== item.id));
      toast.success("封禁已解除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "解除封禁失败");
    } finally {
      setDeleting("");
    }
  };

  return (
    <SettingsCard
      icon={Ban}
      title="注册封禁记录"
      tone="slate"
      action={<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />刷新</Button>}
    >
      {loading && items.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />正在加载...</div>
      ) : items.length === 0 ? (
        <SettingsEmptyState icon={Ban} title="暂无生效封禁" description="触发设备、IP 或频率规则后会显示在这里。" />
      ) : (
        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
          {items.map((item) => (
            <div key={item.id} className={settingsListItemClassName}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{kindLabels[item.kind] || item.kind}</Badge><span className="text-xs text-muted-foreground">{item.code}</span></div>
                  <div className="break-all font-mono text-xs text-foreground">{item.key}</div>
                  <div className="text-xs leading-5 text-muted-foreground">{item.reason} · 到期 {formatDate(item.expires_at)}</div>
                </div>
                <Button variant="ghost" size="icon" aria-label="解除封禁" disabled={deleting === item.id} onClick={() => void remove(item)}>
                  {deleting === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
