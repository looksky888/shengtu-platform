const DEFAULT_RECONNECT_BASE_MS = 1500;
const DEFAULT_RECONNECT_MAX_MS = 30000;

interface SSEFetchResponse {
  ok: boolean;
  status?: number;
  body: ReadableStream<Uint8Array> | null;
}

interface SSEClientDependencies {
  fetch: (url: string, init: RequestInit) => Promise<SSEFetchResponse>;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

interface AuthenticatedSSEOptions {
  url: string;
  getToken: () => Promise<string>;
  onData: (data: string) => void;
  onUnauthorized?: () => void | Promise<void>;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

export interface SSEDataParser {
  push(chunk: string): void;
}

export function createSSEDataParser(onData: (data: string) => void): SSEDataParser {
  let buffer = "";

  return {
    push(chunk) {
      buffer += chunk;
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data && data !== "[DONE]") onData(data);
      }
    },
  };
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
  shouldStop: () => boolean,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEDataParser(onData);
  try {
    while (!shouldStop()) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function startAuthenticatedSSE(
  options: AuthenticatedSSEOptions,
  dependencies: Partial<SSEClientDependencies> = {},
): () => void {
  const fetchRequest = dependencies.fetch ?? ((url, init) => fetch(url, init));
  const scheduleTimeout =
    dependencies.setTimeout ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
  const cancelTimeout =
    dependencies.clearTimeout ??
    ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>));
  const reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
  const reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
  const outerController = new AbortController();
  let closed = false;
  let attempt = 0;
  let reconnectTimer: unknown;

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== undefined) return;
    const delay = Math.min(reconnectMaxMs, reconnectBaseMs * 2 ** attempt);
    attempt += 1;
    reconnectTimer = scheduleTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  };

  const connect = async () => {
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    if (outerController.signal.aborted) {
      attemptController.abort();
    } else {
      outerController.signal.addEventListener("abort", abortAttempt, { once: true });
    }

    try {
      const token = (await options.getToken()).trim();
      if (closed) return;
      if (!token) {
        closed = true;
        return;
      }

      const response = await fetchRequest(options.url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        credentials: "include",
        signal: attemptController.signal,
      });
      if (closed) return;
      if (response.status === 401) {
        closed = true;
        await options.onUnauthorized?.();
        return;
      }
      if (response.status === 403 || response.status === 404) {
        closed = true;
        return;
      }
      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }

      attempt = 0;
      await readStream(
        response.body,
        options.onData,
        () => closed || attemptController.signal.aborted,
      );
      if (!closed) scheduleReconnect();
    } catch {
      if (!closed) scheduleReconnect();
    } finally {
      outerController.signal.removeEventListener("abort", abortAttempt);
    }
  };

  void connect();
  return () => {
    closed = true;
    if (reconnectTimer !== undefined) cancelTimeout(reconnectTimer);
    outerController.abort();
  };
}
