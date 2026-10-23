import { LoaderCircle } from "lucide-react";

export function RegisterCardLoading() {
  return (
    <div className="flex items-center justify-center rounded-[14px] border border-border/80 bg-surface p-12 shadow-2xs">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
