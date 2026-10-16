import { ArrowLeft } from "lucide-react";

type AccountImportBackButtonProps = {
  onClick: () => void;
};

export function AccountImportBackButton({ onClick }: AccountImportBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-stone-500 transition hover:text-stone-800"
    >
      <ArrowLeft className="size-4" />
      返回导入方式
    </button>
  );
}