export function resolveDialogMaxWidthClass(className?: string): string {
  if (!className) return "max-w-[560px]";
  const hasExplicitMaxWidth = /(?:^|\s)max-w-/.test(className);
  if (hasExplicitMaxWidth) return "";
  const hasMinWidthExpr = /(?:^|\s)(?:sm:|md:|lg:|xl:|2xl:)?w-\[min\(/.test(
    className,
  );
  return hasMinWidthExpr ? "max-w-none" : "max-w-[560px]";
}
