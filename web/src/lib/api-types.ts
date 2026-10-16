export * from "@/lib/api-models";
export * from "@/lib/account-types";
export * from "@/lib/settings-types";
export * from "@/lib/image-task-types";
export * from "@/lib/auth-user-types";
export * from "@/lib/register-types";

/** Canonical cursor pagination envelope used by media and other large lists. */
export type CursorPage<T> = {
  items: T[];
  total: number;
  has_more: boolean;
  next_cursor: string;
  limit: number;
};

export type ScopedCursorPage<T, S extends string = string> = CursorPage<T> & {
  scope: S;
};
