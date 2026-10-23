"use client";

import { Link2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useSettingsStore } from "../store";
import {
  SettingsSecretInput,
  settingsDialogInputClassName,
} from "./settings-ui";

export function CPAPoolDialog() {
  const dialogOpen = useSettingsStore((state) => state.dialogOpen);
  const editingPool = useSettingsStore((state) => state.editingPool);
  const formName = useSettingsStore((state) => state.formName);
  const formBaseUrl = useSettingsStore((state) => state.formBaseUrl);
  const formSecretKey = useSettingsStore((state) => state.formSecretKey);
  const isSavingPool = useSettingsStore((state) => state.isSavingPool);
  const setDialogOpen = useSettingsStore((state) => state.setDialogOpen);
  const setFormName = useSettingsStore((state) => state.setFormName);
  const setFormBaseUrl = useSettingsStore((state) => state.setFormBaseUrl);
  const setFormSecretKey = useSettingsStore((state) => state.setFormSecretKey);
  const savePool = useSettingsStore((state) => state.savePool);

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(nextOpen) => {
        if (!isSavingPool) setDialogOpen(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={!isSavingPool}
        className="sm:max-w-md rounded-xl p-6"
      >
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle>
            {editingPool ? "编辑 CPA 连接" : "添加 CPA 连接"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5 sm:text-sm">
            {editingPool
              ? "修改远程 CLIProxyAPI 服务地址或轮换管理端密钥。"
              : "配置远程 CLIProxyAPI 服务地址与管理端密钥以同步号池。"}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="cpa-pool-name">连接备注名称（可选）</FieldLabel>
            <Input
              id="cpa-pool-name"
              value={formName}
              disabled={isSavingPool}
              onChange={(event) => setFormName(event.target.value)}
              placeholder="例如：香港主号池、东京备用节点"
              className={cn("h-9", settingsDialogInputClassName)}
            />
          </Field>

          <Field>
            <FieldLabel
              htmlFor="cpa-pool-base-url"
              className="flex items-center gap-1.5"
            >
              <Link2 className="size-3.5 text-muted-foreground" />
              CPA 服务地址
            </FieldLabel>
            <Input
              id="cpa-pool-base-url"
              value={formBaseUrl}
              disabled={isSavingPool}
              onChange={(event) => setFormBaseUrl(event.target.value)}
              placeholder="http://your-cpa-host:8317"
              className={cn(
                "h-9 font-mono text-xs sm:text-[13px]",
                settingsDialogInputClassName
              )}
            />
          </Field>

          <SettingsSecretInput
            id="cpa-pool-secret-key"
            label="Management Secret Key"
            value={formSecretKey}
            onChange={setFormSecretKey}
            configured={Boolean(editingPool)}
            configuredLabel="密钥已配置"
            placeholder={
              editingPool ? "留空则保持原管理密钥不变" : "输入 CPA 管理端密钥"
            }
            onClear={() => setFormSecretKey("")}
            disabled={isSavingPool}
          />
        </FieldGroup>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialogOpen(false)}
            disabled={isSavingPool}
          >
            取消
          </Button>
          <Button
            type="button"
            loading={isSavingPool}
            onClick={() => void savePool()}
          >
            {!isSavingPool ? <Save className="size-4" /> : null}
            {editingPool ? "保存更改" : "添加连接"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
