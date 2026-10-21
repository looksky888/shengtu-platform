import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LoginFormFieldProps = {
  id: string;
  label: string;
  icon: ComponentType<LucideProps>;
  value: string;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  tabIndex?: number;
  autoFocus?: boolean;
  hint?: string;
  /** When true, render show/hide toggle (forces password input semantics). */
  passwordToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  onChange: (value: string) => void;
};

export function LoginFormField({
  id,
  label,
  icon: Icon,
  value,
  placeholder,
  type = "text",
  autoComplete,
  tabIndex,
  autoFocus,
  hint,
  passwordToggle,
  showPassword,
  onTogglePassword,
  onChange,
}: LoginFormFieldProps) {
  const inputType = passwordToggle ? (showPassword ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
          {label}
        </label>
        {hint ? (
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{hint}</span>
        ) : null}
      </div>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        />
        <Input
          id={id}
          type={inputType}
          autoComplete={autoComplete}
          tabIndex={tabIndex}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-10 rounded-lg border-slate-200 bg-white pl-10 shadow-2xs",
            "focus-visible:border-[#1456f0] focus-visible:ring-[#1456f0]/20",
            "dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500",
            passwordToggle ? "pr-10" : "",
          )}
        />
        {passwordToggle ? (
          <button
            type="button"
            tabIndex={tabIndex}
            className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
            onClick={onTogglePassword}
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
