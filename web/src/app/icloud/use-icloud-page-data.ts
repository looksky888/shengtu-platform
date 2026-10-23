import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  icloudApi,
  type ICloudBridgeStatus,
  type ICloudMailbox,
  type ICloudMailboxList,
  type ICloudMailboxUsage,
  type ICloudScheduler,
  type ICloudSession,
} from "@/lib/icloud-api";

import { createICloudMetrics } from "./icloud-metrics";

export type ICloudLoadErrors = {
  sessions: string;
  mailboxes: string;
  scheduler: string;
};

const emptyLoadErrors = (): ICloudLoadErrors => ({ sessions: "", mailboxes: "", scheduler: "" });

function errorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error && error.message ? error.message : fallback;
  return sanitizeICloudMessage(raw);
}

export function sanitizeICloudMessage(message: string) {
  return message
    .replace(/\s*[（(]\s*CHATGPT2API_FEATURE_ICLOUD[^）)]*[）)]/gi, "")
    .replace(/\bCHATGPT2API_FEATURE_ICLOUD\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function useICloudPageData(enabled: boolean) {
  const [loading, setLoading] = useState(true);
  const [mailboxLoading, setMailboxLoading] = useState(false);
  const [bridge, setBridge] = useState<ICloudBridgeStatus | null>(null);
  const [sessions, setSessions] = useState<ICloudSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [mailboxes, setMailboxes] = useState<ICloudMailbox[]>([]);
  const [scheduler, setScheduler] = useState<ICloudScheduler | null>(null);
  const [pageError, setPageError] = useState("");
  const [loadErrors, setLoadErrors] = useState<ICloudLoadErrors>(emptyLoadErrors);
  const [mailboxSearch, setMailboxSearchState] = useState("");
  const [mailboxUsage, setMailboxUsage] = useState<ICloudMailboxUsage>("all");
  const [mailboxPage, setMailboxPage] = useState(1);
  const [mailboxFilteredTotal, setMailboxFilteredTotal] = useState(0);
  const [mailboxTotalPages, setMailboxTotalPages] = useState(1);
  const [mailboxSummary, setMailboxSummary] = useState({ total: 0, openAIClaimed: 0 });
  const mailboxSearchRef = useRef(mailboxSearch);
  const mailboxUsageRef = useRef(mailboxUsage);
  const mailboxPageRef = useRef(mailboxPage);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshSequenceRef = useRef(0);
  const mailboxAbortRef = useRef<AbortController | null>(null);
  const mailboxSequenceRef = useRef(0);

  const setMailboxSearch = useCallback((value: string) => {
    mailboxSearchRef.current = value;
    setMailboxSearchState(value);
  }, []);

  useEffect(() => {
    mailboxPageRef.current = mailboxPage;
  }, [mailboxPage]);

  const applyMailboxResult = useCallback((result: ICloudMailboxList) => {
    setMailboxes(Array.isArray(result.mailboxes) ? result.mailboxes : []);
    setMailboxFilteredTotal(Math.max(0, result.pagination?.total || 0));
    setMailboxTotalPages(Math.max(1, result.pagination?.total_pages || 1));
    setMailboxSummary({
      total: Math.max(0, result.summary?.total || 0),
      openAIClaimed: Math.max(0, result.summary?.openai_claimed || 0),
    });
  }, []);

  const refreshMailboxList = useCallback(async (
    page = mailboxPageRef.current,
    search = mailboxSearchRef.current,
    usage = mailboxUsageRef.current,
  ) => {
    mailboxAbortRef.current?.abort();
    const controller = new AbortController();
    mailboxAbortRef.current = controller;
    const sequence = ++mailboxSequenceRef.current;
    const isCurrent = () => !controller.signal.aborted && sequence === mailboxSequenceRef.current;
    setMailboxLoading(true);
    setLoadErrors((current) => ({ ...current, mailboxes: "" }));
    try {
      const result = await icloudApi.listMailboxes({
        page,
        page_size: 20,
        search: search || undefined,
        usage,
      }, { signal: controller.signal });
      if (!isCurrent()) return;
      applyMailboxResult(result);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadErrors((current) => ({
        ...current,
        mailboxes: errorMessage(error, "加载隐私邮箱失败"),
      }));
    } finally {
      if (isCurrent()) {
        mailboxAbortRef.current = null;
        setMailboxLoading(false);
      }
    }
  }, [applyMailboxResult]);

  const refreshAll = useCallback(async () => {
    refreshAbortRef.current?.abort();
    mailboxAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const sequence = ++refreshSequenceRef.current;
    const mailboxSequence = ++mailboxSequenceRef.current;
    const isCurrent = () => !controller.signal.aborted && sequence === refreshSequenceRef.current;
    setLoading(true);
    setMailboxLoading(true);
    setSessionsLoaded(false);
    setPageError("");
    setLoadErrors(emptyLoadErrors());
    try {
      const nextBridge = await icloudApi.bridgeStatus({ signal: controller.signal });
      if (!isCurrent()) return;
      setBridge(nextBridge);
      if (nextBridge.enabled === false || nextBridge.reachable === false) {
        setSessions([]);
        setMailboxes([]);
        setMailboxFilteredTotal(0);
        setMailboxSummary({ total: 0, openAIClaimed: 0 });
        setScheduler(null);
        setPageError(sanitizeICloudMessage(nextBridge.error || "iCloud Bridge 未就绪"));
        return;
      }

      const [statusResult, mailboxResult, schedulerResult] = await Promise.allSettled([
        icloudApi.status({ signal: controller.signal }),
        icloudApi.listMailboxes({
          page: mailboxPageRef.current,
          page_size: 20,
          search: mailboxSearchRef.current || undefined,
          usage: mailboxUsageRef.current,
        }, { signal: controller.signal }),
        icloudApi.schedulerStatus({ signal: controller.signal }),
      ]);
      if (!isCurrent()) return;
      const nextErrors = emptyLoadErrors();
      if (statusResult.status === "fulfilled") {
        const nextSessions = statusResult.value.icloud_sessions;
        setSessions(Array.isArray(nextSessions) ? nextSessions : []);
        setSessionsLoaded(true);
      } else {
        nextErrors.sessions = errorMessage(statusResult.reason, "加载 Apple 登录态失败");
      }
      if (mailboxResult.status === "fulfilled") {
        if (mailboxSequence === mailboxSequenceRef.current) applyMailboxResult(mailboxResult.value);
      } else if (mailboxSequence === mailboxSequenceRef.current) {
        nextErrors.mailboxes = errorMessage(mailboxResult.reason, "加载隐私邮箱失败");
      }
      if (schedulerResult.status === "fulfilled") {
        setScheduler(schedulerResult.value.scheduler || null);
      } else {
        nextErrors.scheduler = errorMessage(schedulerResult.reason, "加载定时创建状态失败");
      }
      setLoadErrors(nextErrors);
    } catch (error) {
      if (!isCurrent()) return;
      setPageError(errorMessage(error, "加载 iCloud Bridge 失败"));
      setBridge(null);
    } finally {
      if (isCurrent()) {
        refreshAbortRef.current = null;
        setLoading(false);
        if (mailboxSequence === mailboxSequenceRef.current) setMailboxLoading(false);
      }
    }
  }, [applyMailboxResult]);

  const searchMailboxes = useCallback(async () => {
    mailboxPageRef.current = 1;
    setMailboxPage(1);
    await refreshMailboxList(1, mailboxSearchRef.current, mailboxUsageRef.current);
  }, [refreshMailboxList]);

  const changeMailboxPage = useCallback(async (page: number) => {
    const nextPage = Math.max(1, page);
    if (nextPage === mailboxPageRef.current) return;
    mailboxPageRef.current = nextPage;
    setMailboxPage(nextPage);
    await refreshMailboxList(nextPage, mailboxSearchRef.current, mailboxUsageRef.current);
  }, [refreshMailboxList]);

  const changeMailboxUsage = useCallback(async (usage: ICloudMailboxUsage) => {
    if (usage === mailboxUsageRef.current) return;
    mailboxUsageRef.current = usage;
    setMailboxUsage(usage);
    mailboxPageRef.current = 1;
    setMailboxPage(1);
    await refreshMailboxList(1, mailboxSearchRef.current, usage);
  }, [refreshMailboxList]);

  const refreshFirstMailboxPage = useCallback(async () => {
    mailboxPageRef.current = 1;
    setMailboxPage(1);
    await refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (enabled) {
      void refreshAll();
    } else {
      refreshAbortRef.current?.abort();
      mailboxAbortRef.current?.abort();
      refreshAbortRef.current = null;
      mailboxAbortRef.current = null;
      refreshSequenceRef.current += 1;
      mailboxSequenceRef.current += 1;
      setLoading(false);
      setMailboxLoading(false);
    }
  }, [enabled, refreshAll]);

  useEffect(() => () => {
    refreshAbortRef.current?.abort();
    mailboxAbortRef.current?.abort();
  }, []);

  const metrics = useMemo(
    () => createICloudMetrics(bridge, sessions, mailboxSummary),
    [bridge, sessions, mailboxSummary],
  );

  return {
    loading, mailboxLoading, bridge, sessions, sessionsLoaded, mailboxes, scheduler, setScheduler, pageError, loadErrors, metrics,
    mailboxSummary, mailboxSearch, setMailboxSearch, mailboxUsage, mailboxPage, mailboxFilteredTotal, mailboxTotalPages,
    refreshAll, refreshFirstMailboxPage, refreshMailboxList, searchMailboxes, changeMailboxPage, changeMailboxUsage,
  };
}
