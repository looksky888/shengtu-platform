import { useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { canvasLink } from "@/lib/canvas-link";
import { useSettingsStore } from "../store";
import { SettingsCard, settingsInputClassName } from "./settings-ui";

export function CanvasLinkCard() {
  const config = useSettingsStore((state) => state.config);
  const saving = useSettingsStore((state) => state.isSavingConfig);
  const setCanvasUrl = useSettingsStore((state) => state.setCanvasUrl);
  const saveSection = useSettingsStore((state) => state.saveConfigSection);
  const [error, setError] = useState("");
  const value = config?.canvas_url || "";
  const save = async () => {
    if (value.trim() && !canvasLink(value)) {
      setError("请填写不含账号密码的完整 HTTP/HTTPS 链接");
      return;
    }
    setError("");
    await saveSection(["canvas_url"]);
  };
  return (
    <SettingsCard icon={ExternalLink} title="无限画布">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="canvas-entry-url">入口地址</FieldLabel>
          <Input id="canvas-entry-url" type="url" value={value} disabled={!config || saving} maxLength={2048} placeholder="https://canvas.example.com/" className={settingsInputClassName} aria-invalid={!!error} aria-describedby="canvas-entry-hint" onChange={(event) => { setCanvasUrl(event.target.value); setError(""); }} />
          <p id="canvas-entry-hint" className="text-xs text-muted-foreground">留空隐藏入口；在新标签页打开，登录和积分独立。</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </Field>
        <div className="flex justify-end">
          <Button type="button" disabled={!config || saving} onClick={() => void save()}><Save className="size-4" />{saving ? "保存中…" : "保存"}</Button>
        </div>
      </div>
    </SettingsCard>
  );
}
