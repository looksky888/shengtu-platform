import { Input } from "@/components/ui/input";

type RegisterFieldProps = {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
};

export function RegisterField({ label, value, disabled, placeholder, onChange }: RegisterFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <Input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 rounded-lg" disabled={disabled} />
    </div>
  );
}
