type ProfileInfoRowProps = {
  label: string;
  value: string;
  code?: boolean;
};

export function ProfileInfoRow({ label, value, code }: ProfileInfoRowProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {code ? (
        <code className="truncate font-mono text-sm text-foreground">{value || "—"}</code>
      ) : (
        <span className="truncate text-sm font-medium text-foreground">{value || "—"}</span>
      )}
    </div>
  );
}
