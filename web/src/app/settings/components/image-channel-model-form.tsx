import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ImageChannelModel, ImageChannelModelInput } from "@/lib/image-channel-api";

import { settingsDialogInputClassName, settingsInlineToggleClassName } from "./settings-ui";

const defaultModelInput: ImageChannelModelInput = {
  display_name: "",
  upstream_model: "",
  capabilities: ["generate", "edit"],
  resolutions: ["1k"],
  formats: ["png"],
  credit_cost: 1,
  credit_costs: { "1k": 1 },
  enabled: true,
  sort: 10,
};

function fromModel(model: ImageChannelModel | null): ImageChannelModelInput {
  if (!model) return defaultModelInput;
  return {
    display_name: model.display_name,
    upstream_model: model.upstream_model,
    capabilities: [...model.capabilities],
    resolutions: [...(model.resolutions || [])],
    formats: [...(model.formats || [])],
    credit_cost: model.credit_cost,
    credit_costs: { ...(model.credit_costs || {}) },
    enabled: model.enabled,
    sort: model.sort,
  };
}

function ToggleList({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={active ? "rounded-full bg-[#181e25] px-3 py-1.5 text-xs font-medium text-white" : "rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"}
              onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ImageChannelModelForm({
  model,
  saving,
  suggestions,
  initialUpstreamModel,
  onCancel,
  onSave,
}: {
  model: ImageChannelModel | null;
  saving: boolean;
  suggestions: string[];
  initialUpstreamModel?: string;
  onCancel: () => void;
  onSave: (input: ImageChannelModelInput) => Promise<void>;
}) {
  const [input, setInput] = useState<ImageChannelModelInput>(() => ({
    ...fromModel(model),
    upstream_model: model?.upstream_model || initialUpstreamModel || "",
  }));
  useEffect(() => {
    setInput({
      ...fromModel(model),
      upstream_model: model?.upstream_model || initialUpstreamModel || "",
    });
  }, [initialUpstreamModel, model]);
  const set = <K extends keyof ImageChannelModelInput>(key: K, value: ImageChannelModelInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-5 rounded-[20px] border border-[#bfdbfe] bg-[#f8fbff] p-5 dark:border-sky-900/60 dark:bg-sky-950/10">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="channel-model-upstream">上游模型 ID</FieldLabel>
          <Input id="channel-model-upstream" list="channel-model-suggestions" value={input.upstream_model} onChange={(event) => set("upstream_model", event.target.value)} className={settingsDialogInputClassName} placeholder="gpt-image-1" />
          <datalist id="channel-model-suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="channel-model-name">前台名称</FieldLabel>
          <Input id="channel-model-name" value={input.display_name} onChange={(event) => set("display_name", event.target.value)} className={settingsDialogInputClassName} placeholder="留空则与上游 ID 一致" />
        </Field>
        <Field>
          <FieldLabel htmlFor="channel-model-cost">默认积分 / 张</FieldLabel>
          <Input id="channel-model-cost" type="number" min={1} value={input.credit_cost} onChange={(event) => set("credit_cost", Number(event.target.value))} className={settingsDialogInputClassName} />
        </Field>
        <Field>
          <FieldLabel htmlFor="channel-model-sort">显示顺序</FieldLabel>
          <Input id="channel-model-sort" type="number" value={input.sort} onChange={(event) => set("sort", Number(event.target.value))} className={settingsDialogInputClassName} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(input.resolutions || []).map((resolution) => (
          <Field key={resolution}>
            <FieldLabel htmlFor={`channel-model-cost-${resolution}`}>{resolution.toUpperCase()} 积分 / 张</FieldLabel>
            <Input
              id={`channel-model-cost-${resolution}`}
              type="number"
              min={1}
              value={input.credit_costs?.[resolution] ?? input.credit_cost}
              onChange={(event) => set("credit_costs", { ...(input.credit_costs || {}), [resolution]: Number(event.target.value) })}
              className={settingsDialogInputClassName}
            />
          </Field>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ToggleList label="能力" values={["generate", "edit"]} selected={input.capabilities} onChange={(values) => set("capabilities", values as ImageChannelModelInput["capabilities"])} />
        <ToggleList label="分辨率" values={["1k", "2k", "4k"]} selected={input.resolutions || []} onChange={(values) => set("resolutions", values)} />
        <ToggleList label="输出格式" values={["png", "jpeg", "webp"]} selected={input.formats || []} onChange={(values) => set("formats", values)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className={settingsInlineToggleClassName}>
          <Checkbox checked={input.enabled} onCheckedChange={(checked) => set("enabled", Boolean(checked))} />
          启用模型
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
          <Button type="button" disabled={saving} onClick={() => void onSave(input)}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            保存模型
          </Button>
        </div>
      </div>
    </div>
  );
}
