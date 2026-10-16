export type ICloudMailboxUsage = "all" | "unused" | "used";

export type ICloudMailboxListParams = {
  page?: number;
  page_size?: number;
  search?: string;
  account_id?: string;
  usage?: ICloudMailboxUsage;
};

export function buildICloudMailboxListQuery(params: ICloudMailboxListParams = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.account_id) q.set("account_id", params.account_id);
  if (params.usage && params.usage !== "all") q.set("usage", params.usage);
  return q.toString();
}
