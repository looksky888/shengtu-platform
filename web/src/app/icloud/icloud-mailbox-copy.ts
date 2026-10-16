import type { ICloudMailbox } from "@/lib/icloud-api";

export function formatMailboxAPICopyText(
  mailbox: Pick<ICloudMailbox, "email" | "api_url">,
  origin: string,
): string {
  const email = mailbox.email?.trim();
  const apiURL = mailbox.api_url?.trim();
  if (!email || !apiURL) {
    return "";
  }
  try {
    return `${email}----${new URL(apiURL, origin).toString()}`;
  } catch {
    return "";
  }
}
