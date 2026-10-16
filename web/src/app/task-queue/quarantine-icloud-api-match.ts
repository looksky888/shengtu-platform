import type { QuarantineItem } from "@/lib/api";
import type { ICloudMailbox, ICloudMailboxLookup } from "@/lib/icloud-api";

const LOOKUP_BATCH_SIZE = 500;

export type QuarantineICloudAPIMatchResult = {
  permanentCount: number;
  requestedCount: number;
  withoutEmailCount: number;
  matched: Array<{ email: string; text: string }>;
  missing: string[];
  apiUnavailable: string[];
  copyText: string;
};

type LookupMailboxes = (emails: string[]) => Promise<ICloudMailboxLookup>;
type FormatMailboxAPI = (mailbox: Pick<ICloudMailbox, "email" | "api_url">, origin: string) => string;

export async function matchPermanentQuarantineMailboxAPIs(
  items: QuarantineItem[],
  origin: string,
  lookupMailboxes: LookupMailboxes,
  formatMailboxAPI: FormatMailboxAPI,
): Promise<QuarantineICloudAPIMatchResult> {
  const permanentItems = items.filter((item) => item.grade === "permanent");
  const emails = uniqueEmails(permanentItems);
  const mailboxes: ICloudMailbox[] = [];

  for (let start = 0; start < emails.length; start += LOOKUP_BATCH_SIZE) {
    const batch = emails.slice(start, start + LOOKUP_BATCH_SIZE);
    const response = await lookupMailboxes(batch);
    if (response.success !== true || !Array.isArray(response.mailboxes) || !Array.isArray(response.missing)) {
      throw new Error("iCloud 邮箱匹配返回格式错误");
    }
    mailboxes.push(...response.mailboxes);
  }

  const mailboxByEmail = new Map<string, ICloudMailbox>();
  for (const mailbox of mailboxes) {
    const key = normalizeEmail(mailbox.email);
    if (key && !mailboxByEmail.has(key)) mailboxByEmail.set(key, mailbox);
  }

  const matched: Array<{ email: string; text: string }> = [];
  const missing: string[] = [];
  const apiUnavailable: string[] = [];
  for (const email of emails) {
    const mailbox = mailboxByEmail.get(normalizeEmail(email));
    if (!mailbox) {
      missing.push(email);
      continue;
    }
    const text = mailbox.api_active === false ? "" : formatMailboxAPI(mailbox, origin);
    if (!text) {
      apiUnavailable.push(email);
      continue;
    }
    matched.push({ email, text });
  }

  return {
    permanentCount: permanentItems.length,
    requestedCount: emails.length,
    withoutEmailCount: permanentItems.filter((item) => !normalizeEmail(item.email)).length,
    matched,
    missing,
    apiUnavailable,
    copyText: matched.map((item) => item.text).join("\n"),
  };
}

function uniqueEmails(items: QuarantineItem[]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const item of items) {
    const email = item.email?.trim() || "";
    const key = normalizeEmail(email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

function normalizeEmail(email: string | undefined): string {
  return email?.trim().toLowerCase() || "";
}
