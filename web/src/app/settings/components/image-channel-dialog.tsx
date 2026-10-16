import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ImageChannel, ImageChannelInput, ImageChannelType } from "@/lib/image-channel-api";

import { settingsDialogInputClassName, settingsInlineToggleClassName } from "./settings-ui";

const defaultInput: ImageChannelInput = {
  name: "",
  alias: "",
  type: "openai_compatible",
  base_url: "",
  api_key: "",
  enabled: true,
  sort: 30,
  max_concurrency: 2,
  timeout_seconds: 300,
  max_retries: 1,
  download_urls: true,
};

function inputFromChannel(channel: ImageChannel | null): ImageChannelInput {
  if (!channel) return defaultInput;
  return {
    name: channel.name,
    alias: channel.alias || "",
    type: channel.type,
    base_url: channel.base_url || "",
    api_key: "",
    enabled: channel.enabled,
    sort: channel.sort,
    max_concurrency: channel.max_concurrency,
    timeout_seconds: channel.timeout_seconds,
    max_retries: channel.max_retries,
    download_urls: channel.download_urls,
  };
}

export function ImageChannelDialog({
  channel,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  channel: ImageChannel | null;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ImageChannelInput) => Promise<void>;
}) {
  const [input, setInput] = useState<ImageChannelInput>(() => inputFromChannel(channel));
  const relay = input.type === "openai_compatible";

  useEffect(() => {
    if (open) setInput(inputFromChannel(channel));
  }, [channel, open]);

  const set = <K extends keyof ImageChannelInput>(key: K, value: ImageChannelInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] w-[min(94vw,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{channel ? "编辑渠道" : "新增生图渠道"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="channel-name">渠道名称</FieldLabel>
              <Input id="channel-name" value={input.name} onChange={(event) => set("name", event.target.value)} className={settingsDialogInputClassName} placeholder="例如：影策中转" />
            </Field>
            <Field>
              <FieldLabel htmlFor="channel-alias">前台标记</FieldLabel>
              <Input id="channel-alias" value={input.alias} onChange={(event) => set("alias", event.target.value)} className={settingsDialogInputClassName} placeholder="例如：渠道 2" />
            </Field>
            <Field>
              <FieldLabel>渠道类型</FieldLabel>
              <Select disabled={Boolean(channel?.system)} value={input.type} onValueChange={(value) => set("type", value as ImageChannelType)}>
                <SelectTrigger className={settingsDialogInputClassName}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai_compatible">OpenAI 兼容中转站</SelectItem>
                  <SelectItem value="account_pool">本地 GPT 号池</SelectItem>
                  <SelectItem value="grok_runtime">本地 Grok 号池</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="channel-sort">显示顺序</FieldLabel>
              <Input id="channel-sort" type="number" value={input.sort} onChange={(event) => set("sort", Number(event.target.value))} className={settingsDialogInputClassName} />
            </Field>
          </div>

          {relay ? (
            <div className="grid gap-4 rounded-[18px] border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="channel-base-url">Base URL</FieldLabel>
                <Input id="channel-base-url" value={input.base_url} onChange={(event) => set("base_url", event.target.value)} className={settingsDialogInputClassName} placeholder="https://api.example.com/v1" />
              </Field>
              <Field>
                <FieldLabel htmlFor="channel-api-key">API Key{channel?.api_key_configured ? "（已配置）" : ""}</FieldLabel>
                <Input id="channel-api-key" type="password" value={input.api_key} onChange={(event) => set("api_key", event.target.value)} className={settingsDialogInputClassName} placeholder={channel?.api_key_configured ? "留空表示不修改" : "sk-..."} />
              </Field>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="channel-concurrency">最大并发</FieldLabel>
              <Input id="channel-concurrency" type="number" min={1} max={100} value={input.max_concurrency} onChange={(event) => set("max_concurrency", Number(event.target.value))} className={settingsDialogInputClassName} />
            </Field>
            <Field>
              <FieldLabel htmlFor="channel-timeout">超时（秒）</FieldLabel>
              <Input id="channel-timeout" type="number" min={30} max={3600} value={input.timeout_seconds} onChange={(event) => set("timeout_seconds", Number(event.target.value))} className={settingsDialogInputClassName} />
            </Field>
            <Field>
              <FieldLabel htmlFor="channel-retries">失败重试</FieldLabel>
              <Input id="channel-retries" type="number" min={0} max={5} value={input.max_retries} onChange={(event) => set("max_retries", Number(event.target.value))} className={settingsDialogInputClassName} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={settingsInlineToggleClassName}>
              <Checkbox checked={input.enabled} onCheckedChange={(checked) => set("enabled", Boolean(checked))} />
              启用渠道
            </label>
            <label className={settingsInlineToggleClassName}>
              <Checkbox checked={input.download_urls} onCheckedChange={(checked) => set("download_urls", Boolean(checked))} />
              图片归档到本站
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" disabled={saving} onClick={() => void onSave(input)}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            保存渠道
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
