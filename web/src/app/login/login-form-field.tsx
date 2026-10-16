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
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-semibold text-stone-800 dark:text-amber-50/90">
          {label}
        </label>
        {hint ? (
          <span className="text-[11px] font-medium text-stone-400 dark:text-amber-100/40">{hint}</span>
        ) : null}
      </div>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400 dark:text-amber-100/40"
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
            "h-12 rounded-[16px] border-amber-100/90 bg-white/95 pl-10 shadow-[0_6px_18px_rgba(180,83,9,0.05)]",
            "focus-visible:border-amber-300 focus-visible:ring-amber-400/35",
            "dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50 dark:placeholder:text-amber-100/35",
            "dark:shadow-[0_12px_26px_rgba(0,0,0,0.28)] dark:focus-visible:border-amber-600/60 dark:focus-visible:ring-amber-500/30",
            passwordToggle ? "pr-11" : "",
          )}
        />
        {passwordToggle ? (
          <button
            type="button"
            tabIndex={tabIndex}
            className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition hover:bg-amber-50 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 dark:text-amber-100/45 dark:hover:bg-amber-950/50 dark:hover:text-amber-100"
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
