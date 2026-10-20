import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type GrokConfigDialogKind = "concurrency" | "egress" | null;

export function GrokProviderConfigDialog({
  kind,
  count,
  busy,
  onOpenChange,
  onConcurrency,
  onEgress,
}: {
  kind: GrokConfigDialogKind;
  count: number;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConcurrency: (value: number) => void;
  onEgress: (mode: "inherit" | "direct" | "proxy", proxyUrl: string) => void;
}) {
  const [concurrency, setConcurrency] = useState("1");
  const [mode, setMode] = useState<"inherit" | "direct" | "proxy">("inherit");
  const [proxyUrl, setProxyUrl] = useState("");
  useEffect(() => {
    if (!kind) {
      setConcurrency("1");
      setMode("inherit");
      setProxyUrl("");
    }
  }, [kind]);
  const submit = () => {
    if (kind === "concurrency") onConcurrency(Number(concurrency));
    else if (kind === "egress") onEgress(mode, proxyUrl);
    onOpenChange(false);
  };
  const validConcurrency =
    /^\d+$/.test(concurrency) &&
    Number(concurrency) >= 1 &&
    Number(concurrency) <= 256;
  const valid =
    kind === "concurrency"
      ? validConcurrency
      : mode !== "proxy" || Boolean(proxyUrl.trim());
  return (
    <Dialog open={Boolean(kind)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === "concurrency" ? "设置账号并发" : "配置账号出口"}
          </DialogTitle>
          <DialogDescription>
            将对选中的 {count} 个同 Provider 账号统一生效。
          </DialogDescription>
        </DialogHeader>
        {kind === "concurrency" ? (
          <label className="grid gap-2 text-sm font-medium">
            单账号最大并发（1–256）
            <Input
              type="number"
              min={1}
              max={256}
              value={concurrency}
              onChange={(event) => setConcurrency(event.target.value)}
            />
          </label>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2 text-sm font-medium">
              <span>出口模式</span>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as typeof mode)}
              >
                <SelectTrigger aria-label="出口模式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">继承系统出口</SelectItem>
                  <SelectItem value="direct">直连</SelectItem>
                  <SelectItem value="proxy">账号专用代理</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "proxy" ? (
              <label className="grid gap-2 text-sm font-medium">
                代理 URL
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="http://user:password@host:port"
                  value={proxyUrl}
                  onChange={(event) => setProxyUrl(event.target.value)}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  保存后列表只显示稳定出口身份，不回显地址或密码。
                </span>
              </label>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            取消
          </Button>
          <Button variant="brand" onClick={submit} disabled={busy || !valid}>
            确认配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
