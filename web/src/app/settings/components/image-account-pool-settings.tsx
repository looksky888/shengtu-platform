"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEFAULT_IMAGE_MODEL } from "@/lib/api-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useSettingsStore } from "../store";
import { settingsInputClassName, settingsToggleClassName } from "./settings-ui";

const internalModelOptions = [
  "auto",
  "gpt-5-5-thinking",
  "gpt-5-3",
  "gpt-5-3-mini",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5",
  "gpt-5-1",
  "gpt-5-2",
  "gpt-5-mini",
] as const;

export function ImageAccountPoolSettings() {
  const config = useSettingsStore((state) => state.config);
  const setImageProxyField = useSettingsStore((state) => state.setImageProxyField);

  if (!config) {
    return null;
  }

  const fallbackModels = Array.isArray(config.image_fallback_model_slugs) ? config.image_fallback_model_slugs : [];

  return (
    <div className="grid gap-4 rounded-[18px] border border-border/80 bg-muted/25 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>生图默认模型</FieldLabel>
          <div className="flex h-10 items-center rounded-[13px] border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
            {String(config.image_default_model || DEFAULT_IMAGE_MODEL)}
          </div>
          <FieldDescription>
            服务端把缺省生图模型固定为 {DEFAULT_IMAGE_MODEL}（未传 model 或传 auto 时使用）；Studio 仍可按请求选择模型。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="image-internal-model-slug">GPT Images 2.5 账号池路由</FieldLabel>
          <Select value={String(config.image_internal_model_slug || "gpt-5-3")} onValueChange={(value) => setImageProxyField({ image_internal_model_slug: value })}>
            <SelectTrigger id="image-internal-model-slug" className={settingsInputClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {internalModelOptions.map((model) => (
                <SelectItem key={model} value={model}>{model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <label className={settingsToggleClassName} htmlFor="image-fallback-model-enabled">
        <Checkbox
          id="image-fallback-model-enabled"
          checked={config.image_fallback_model_enabled !== false}
          onCheckedChange={(checked) => setImageProxyField({ image_fallback_model_enabled: Boolean(checked) })}
        />
        <span>生图失败后轮询备用底层模型</span>
      </label>

      <Field>
        <FieldLabel htmlFor="image-fallback-model-slugs">备用账号池模型 slug（按顺序轮询）</FieldLabel>
        <Input
          id="image-fallback-model-slugs"
          value={fallbackModels.join(", ")}
          onChange={(event) => setImageProxyField({ image_fallback_model_slugs: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
          placeholder="gpt-5.5, auto"
          className={settingsInputClassName}
        />
      </Field>
    </div>
  );
}
