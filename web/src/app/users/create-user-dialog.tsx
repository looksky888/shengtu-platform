import type { ReactNode } from "react";
import { KeyRound, LoaderCircle, Plus, UserRound } from "lucide-react";

import type { CreateUserErrors, CreateUserForm } from "@/app/users/users-utils";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ManagedRole } from "@/lib/api";

type CreateUserDialogProps = {
  open: boolean;
  form: CreateUserForm;
  errors: CreateUserErrors;
  roles: ManagedRole[];
  isCreating: boolean;
  onOpenChange: (open: boolean) => void;
  onFieldChange: <Key extends keyof CreateUserForm>(field: Key, value: CreateUserForm[Key]) => void;
  onCreate: () => void;
};

export function CreateUserDialog({ open, form, errors, roles, isCreating, onOpenChange, onFieldChange, onCreate }: CreateUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl p-6 sm:max-w-2xl">
        <DialogHeader className="gap-2">
          <DialogTitle>创建用户</DialogTitle>
          <DialogDescription className="text-sm leading-6">创建本地登录用户并绑定角色。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="用户名" icon={<UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />} value={form.username} onChange={(value) => onFieldChange("username", value.toLowerCase())} placeholder="例如：operator_01" autoComplete="username" error={errors.username} />
          <TextField label="显示名称" value={form.name} onChange={(value) => onFieldChange("name", value)} placeholder="例如：运营账号" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="密码" icon={<KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />} value={form.password} onChange={(value) => onFieldChange("password", value)} placeholder="至少 8 位" type="password" autoComplete="new-password" error={errors.password} />
          <TextField label="确认密码" value={form.confirmPassword} onChange={(value) => onFieldChange("confirmPassword", value)} placeholder="再次输入密码" type="password" autoComplete="new-password" error={errors.confirmPassword} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <RoleSelect value={form.role_id} roles={roles} onChange={(value) => onFieldChange("role_id", value)} />
          <StatusSelect enabled={form.enabled} onChange={(value) => onFieldChange("enabled", value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-9 rounded-lg px-4" onClick={() => onOpenChange(false)} disabled={isCreating}>取消</Button>
          <Button type="button" className="h-9 rounded-lg px-4" onClick={onCreate} disabled={isCreating}>
            {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text", autoComplete, error, icon }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className={icon ? "relative" : undefined}>
        {icon}
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} autoComplete={autoComplete} className={`h-9 rounded-lg ${icon ? "pl-9" : ""}`} aria-invalid={Boolean(error)} />
      </div>
      {error ? <p className="text-xs leading-5 text-destructive">{error}</p> : null}
    </div>
  );
}

function RoleSelect({ value, roles, onChange }: { value: string; roles: ManagedRole[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">角色</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 rounded-lg"><SelectValue placeholder="选择角色" /></SelectTrigger>
        <SelectContent>{roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function StatusSelect({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">状态</label>
      <Select value={enabled ? "true" : "false"} onValueChange={(value) => onChange(value === "true")}>
        <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="true">已启用</SelectItem><SelectItem value="false">已禁用</SelectItem></SelectContent>
      </Select>
    </div>
  );
}