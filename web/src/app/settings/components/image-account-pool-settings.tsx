"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IMAGE_MODEL_OPTIONS } from "@/lib/api-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useSettingsStore } from "../store";
import { settingsInputClassName, settingsToggleClassName } from "./settings-ui";

const DEFAULT_IMAGE_MODEL_VALUES = new Set(["gpt-image-2.5-flare", "gpt-image-2.5", "gpt-image-2"]);
const defaultModelOptions = IMAGE_MODEL_OPTIONS.filter((option) => DEFAULT_IMAGE_MODEL_VALUES.has(option.value));

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
          <FieldLabel htmlFor="image-default-model">生图默认模型</FieldLabel>
          <Select value={String(config.image_default_model || "gpt-image-2.5-flare")} onValueChange={(value) => setImageProxyField({ image_default_model: value })}>
            <SelectTrigger id="image-default-model" className={settingsInputClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {defaultModelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
