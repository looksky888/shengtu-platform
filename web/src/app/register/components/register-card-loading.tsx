import { LoaderCircle } from "lucide-react";

export function RegisterCardLoading() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-border/70 bg-card p-10 shadow-2xs">
      <LoaderCircle className="size-5 animate-spin text-stone-400" />
    </div>
  );
}