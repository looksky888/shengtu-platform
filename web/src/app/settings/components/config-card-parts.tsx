import { LoaderCircle } from "lucide-react";
import { type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ProxyTestResult } from "@/lib/api";

import { SettingsNotice, settingsInputClassName, settingsToggleClassName } from "./settings-ui";

export function NumberField({ id, label, onChange, placeholder, value, min, max, error }: { id: string; label: string; onChange: (value: string) => void; placeholder?: string; value: ReactNode; min?: number; max?: number; error?: string }) {
  const rangeHint = min !== undefined ? `允许范围：${min}–${max ?? "不限"}` : undefined;
  return (
    <Field className="min-w-0 gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : rangeHint ? `${id}-range` : undefined}
        title={rangeHint}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={settingsInputClassName}
      />
      {error ? <p id={`${id}-error`} className="text-xs text-rose-600">{error}</p> : null}
      {rangeHint ? <span id={`${id}-range`} className="sr-only">{rangeHint}</span> : null}
    </Field>
  );
}

export function ToggleField({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className={settingsToggleClassName}>
      <Checkbox aria-label={label} checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span>{label}</span>
    </label>
  );
}

export function ProxyResult({ result }: { result: ProxyTestResult | null }) {
  if (!result) return null;
  return (
    <SettingsNotice className={result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
      {result.ok ? `代理可用：HTTP ${result.status}，用时 ${result.latency_ms} ms` : `代理不可用：${result.error ?? "未知错误"}，用时 ${result.latency_ms} ms`}
    </SettingsNotice>
  );
}

export function ConfigLoadingState() {
  return <div className="flex items-center justify-center py-10"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;
}
