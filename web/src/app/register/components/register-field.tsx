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
    <div className="space-y-2">
      <label className="text-sm text-stone-700">{label}</label>
      <Input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 rounded-xl border-stone-200 bg-white" disabled={disabled} />
    </div>
  );
}
