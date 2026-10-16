import { LoaderCircle } from "lucide-react";

export function RegisterCardLoading() {
  return (
    <div className="flex items-center justify-center rounded-[16px] border border-border bg-card p-10 shadow-[0_4px_6px_rgba(0,0,0,0.08)]">
      <LoaderCircle className="size-5 animate-spin text-stone-400" />
    </div>
  );
}