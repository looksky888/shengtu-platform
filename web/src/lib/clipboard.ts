export type CopyTextResult = {
  method: "clipboard" | "execCommand";
};

export async function copyText(value: string): Promise<CopyTextResult> {
  const text = String(value ?? "");

  if (navigator?.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return { method: "clipboard" };
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy command failed");
    }
    return { method: "execCommand" };
  } finally {
    document.body.removeChild(textarea);
  }
}
