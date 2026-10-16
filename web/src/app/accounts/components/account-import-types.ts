export type ImportMethod = "menu" | "token" | "session" | "cpa";

export type PendingCpaImport = {
  tokens: string[];
  parsedFileCount: number;
  errorCount: number;
};