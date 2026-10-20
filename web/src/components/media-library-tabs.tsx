import type { LucideIcon } from "lucide-react";

import { SubNav } from "@/components/ui/sub-nav";

export function MediaLibraryTabs<T extends string>({
  value,
  label,
  options,
  onChange,
}: {
  value: T;
  label: string;
  options: Array<{ value: T; label: string; icon: LucideIcon; badge?: number | string }>;
  onChange: (value: T) => void;
}) {
  return (
    <SubNav
      ariaLabel={label}
      value={value}
      onValueChange={onChange}
      items={options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        icon: opt.icon,
        badge: opt.badge,
      }))}
    />
  );
}
