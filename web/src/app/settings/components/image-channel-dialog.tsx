"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminSlideDrawer, AdminStatusBadge } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ImageChannel,
  ImageChannelInput,
  ImageChannelType,
} from "@/lib/image-channel-api";
import { cn } from "@/lib/utils";

import {
  SettingsSecretInput,
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsDialogInputClassName,
} from "./settings-ui";

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

type NumericFieldKey =
  | "max_concurrency"
  | "timeout_seconds"
  | "max_retries"
  | "sort";

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

function draftsFromInput(
  input: ImageChannelInput,
): Record<NumericFieldKey, string> {
  return {
    max_concurrency: String(input.max_concurrency),
    timeout_seconds: String(input.timeout_seconds),
    max_retries: String(input.max_retries),
    sort: String(input.sort),
  };
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function parseBoundedInt(
  raw: string,
  min: number,
  max: number,
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < min || num > max) return null;
  return num;
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
  const [input, setInput] = useState<ImageChannelInput>(() =>
    inputFromChannel(channel),
  );
  const [drafts, setDrafts] = useState<Record<NumericFieldKey, string>>(() =>
    draftsFromInput(inputFromChannel(channel)),
  );
  const [submitted, setSubmitted] = useState(false);

  const relay = input.type === "openai_compatible";

  useEffect(() => {
    if (open) {
      const initial = inputFromChannel(channel);
      setInput(initial);
      setDrafts(draftsFromInput(initial));
      setSubmitted(false);
    }
  }, [channel, open]);

  const set = <K extends keyof ImageChannelInput>(
    key: K,
    value: ImageChannelInput[K],
  ) => setInput((current) => ({ ...current, [key]: value }));

  const nameError =
    submitted && !input.name.trim() ? "请填写渠道名称" : "";
  const trimmedBaseUrl = input.base_url.trim();
  const baseUrlError = relay
    ? submitted && !trimmedBaseUrl
      ? "请填写网关 Base URL"
      : trimmedBaseUrl && !isValidHttpUrl(trimmedBaseUrl)
        ? "网关 Base URL 必须以 http:// 或 https:// 开头且不含账号密码"
        : ""
    : "";

  const concurrencyVal = parseBoundedInt(drafts.max_concurrency, 1, 100);
  const timeoutVal = parseBoundedInt(drafts.timeout_seconds, 30, 3600);
  const retriesVal = parseBoundedInt(drafts.max_retries, 0, 5);
  const sortVal = parseBoundedInt(drafts.sort, -100000, 100000);

  const handleNormalizeNumber = (
    key: NumericFieldKey,
    min: number,
    max: number,
    fallback: number,
  ) => {
    const parsed = parseBoundedInt(drafts[key], min, max);
    if (parsed !== null) {
      setDrafts((prev) => ({ ...prev, [key]: String(parsed) }));
      set(key, parsed);
    } else if (!drafts[key].trim()) {
      setDrafts((prev) => ({ ...prev, [key]: String(fallback) }));
    }
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (!input.name.trim()) {
      toast.error("请填写渠道名称");
      return;
    }
    if (relay) {
      if (!trimmedBaseUrl) {
        toast.error("请填写网关 Base URL");
        return;
      }
      if (!isValidHttpUrl(trimmedBaseUrl)) {
        toast.error("请填写以 http:// 或 https:// 开头的有效网关 Base URL");
        return;
      }
    }
    if (concurrencyVal === null) {
      toast.error("渠道最大并发必须为 1–100 的整数");
      return;
    }
    if (timeoutVal === null) {
      toast.error("单次请求超时必须为 30–3600 秒的整数");
      return;
    }
    if (retriesVal === null) {
      toast.error("失败重试次数必须为 0–5 的整数");
      return;
    }
    if (sortVal === null) {
      toast.error("显示排序权重必须为整数");
      return;
    }

    void onSave({
      ...input,
      name: input.name.trim(),
      alias: input.alias.trim(),
      base_url: relay ? trimmedBaseUrl : input.base_url.trim(),
      max_concurrency: concurrencyVal,
      timeout_seconds: timeoutVal,
      max_retries: retriesVal,
      sort: sortVal,
    });
  };

  return (
    <AdminSlideDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="w-[min(500px,100vw)]"
      title={channel ? `编辑渠道 · ${channel.name}` : "新增生图供给渠道"}
      headerExtra={
        channel?.system ? (
          <AdminStatusBadge tone="info">系统内置</AdminStatusBadge>
        ) : undefined
      }
      description="配置渠道基础标识、上游鉴权密钥与独立并发调度阈值"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            loading={saving}
            onClick={handleSubmit}
          >
            {channel ? "保存渠道" : "创建渠道"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SettingsSection title="基础标识与类型">
          <div className="grid grid-cols-1 gap-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="channel-name"
                className="block text-xs font-medium text-foreground sm:text-[13px]"
              >
                渠道名称 <span className="text-status-danger">*</span>
              </label>
              <Input
                id="channel-name"
                value={input.name}
                aria-invalid={Boolean(nameError)}
                onChange={(event) => set("name", event.target.value)}
                className={settingsDialogInputClassName}
                placeholder="例如：影策高速渠道"
              />
              {nameError ? (
                <p className="text-xs leading-4 text-status-danger">
                  {nameError}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="channel-alias"
                className="block text-xs font-medium text-foreground sm:text-[13px]"
              >
                前台展示标签（可选）
              </label>
              <Input
                id="channel-alias"
                value={input.alias}
                onChange={(event) => set("alias", event.target.value)}
                className={settingsDialogInputClassName}
                placeholder="例如：主力线路 / 备用 2"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="channel-type"
                className="block text-xs font-medium text-foreground sm:text-[13px]"
              >
                渠道驱动类型
              </label>
              <Select
                disabled={Boolean(channel?.system)}
                value={input.type}
                onValueChange={(value) =>
                  set("type", value as ImageChannelType)
                }
              >
                <SelectTrigger
                  id="channel-type"
                  className={cn("w-full", settingsDialogInputClassName)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai_compatible">
                    OpenAI 兼容渠道
                  </SelectItem>
                  <SelectItem value="account_pool">本地 GPT 号池</SelectItem>
                  <SelectItem value="grok_runtime">本地 Grok 号池</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SettingsSection>

        {relay ? (
          <SettingsSection
            title="网关连接与鉴权"
            description="支持标准 /v1/images/generations 与 /v1/images/edits 协议的兼容网关。"
          >
            <div className="grid grid-cols-1 gap-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="channel-base-url"
                  className="block text-xs font-medium text-foreground sm:text-[13px]"
                >
                  网关 Base URL <span className="text-status-danger">*</span>
                </label>
                <Input
                  id="channel-base-url"
                  value={input.base_url}
                  aria-invalid={Boolean(baseUrlError)}
                  onChange={(event) => set("base_url", event.target.value)}
                  className={cn(
                    settingsDialogInputClassName,
                    "font-mono text-xs sm:text-[13px]",
                  )}
                  placeholder="https://api.example.com/v1"
                />
                {baseUrlError ? (
                  <p className="text-xs leading-4 text-status-danger">
                    {baseUrlError}
                  </p>
                ) : null}
              </div>

              <SettingsSecretInput
                id="channel-api-key"
                label="上游 API Key"
                value={input.api_key}
                onChange={(value) => set("api_key", value)}
                configured={Boolean(
                  channel?.api_key_configured || channel?.api_key_masked,
                )}
                maskedHint={channel?.api_key_masked}
                onClear={() => set("api_key", "")}
              />
            </div>
          </SettingsSection>
        ) : null}

        <SettingsSection title="并发、超时与落盘策略">
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SettingsUnitInput
                id="channel-concurrency"
                label="渠道最大并发"
                unit="并发"
                min={1}
                max={100}
                rangeHint="1–100"
                value={drafts.max_concurrency}
                error={
                  concurrencyVal === null ? "请输入 1–100 的整数" : undefined
                }
                onChange={(value) =>
                  setDrafts((prev) => ({ ...prev, max_concurrency: value }))
                }
                onBlur={() =>
                  handleNormalizeNumber(
                    "max_concurrency",
                    1,
                    100,
                    input.max_concurrency || 2,
                  )
                }
              />
              <SettingsUnitInput
                id="channel-timeout"
                label="单次请求超时"
                unit="秒"
                min={30}
                max={3600}
                rangeHint="30–3600"
                value={drafts.timeout_seconds}
                error={
                  timeoutVal === null ? "请输入 30–3600 的整数" : undefined
                }
                onChange={(value) =>
                  setDrafts((prev) => ({ ...prev, timeout_seconds: value }))
                }
                onBlur={() =>
                  handleNormalizeNumber(
                    "timeout_seconds",
                    30,
                    3600,
                    input.timeout_seconds || 300,
                  )
                }
              />
              <SettingsUnitInput
                id="channel-retries"
                label="失败重试次数"
                unit="次"
                min={0}
                max={5}
                rangeHint="0–5"
                value={drafts.max_retries}
                error={retriesVal === null ? "请输入 0–5 的整数" : undefined}
                onChange={(value) =>
                  setDrafts((prev) => ({ ...prev, max_retries: value }))
                }
                onBlur={() =>
                  handleNormalizeNumber(
                    "max_retries",
                    0,
                    5,
                    input.max_retries ?? 1,
                  )
                }
              />
              <SettingsUnitInput
                id="channel-sort"
                label="显示排序权重"
                unit="权重"
                description="越小越靠前"
                value={drafts.sort}
                error={sortVal === null ? "请输入整数权重" : undefined}
                onChange={(value) =>
                  setDrafts((prev) => ({ ...prev, sort: value }))
                }
                onBlur={() =>
                  handleNormalizeNumber(
                    "sort",
                    -100000,
                    100000,
                    input.sort ?? 30,
                  )
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <SettingsSwitchRow
                size="sm"
                title="启用该生图渠道"
                description="关闭后创作台隐藏此渠道模型，在途任务不受影响"
                checked={input.enabled}
                onCheckedChange={(checked) => set("enabled", checked)}
              />
              <SettingsSwitchRow
                size="sm"
                title="远程图片自动归档至本站"
                description="自动拉取上游临时链接并持久化存储至本地或 R2"
                checked={input.download_urls}
                onCheckedChange={(checked) => set("download_urls", checked)}
              />
            </div>
          </div>
        </SettingsSection>
      </div>
    </AdminSlideDrawer>
  );
}
