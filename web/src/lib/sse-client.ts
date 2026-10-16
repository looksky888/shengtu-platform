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
  const controller = new AbortController();
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
    try {
      const token = await options.getToken();
      if (closed) return;
      if (!token) {
        scheduleReconnect();
        return;
      }

      const response = await fetchRequest(options.url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        credentials: "include",
        signal: controller.signal,
      });
      if (closed) return;
      if (response.status === 401) {
        closed = true;
        await options.onUnauthorized?.();
        return;
      }
      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }

      attempt = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSSEDataParser(options.onData);
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      if (!closed) scheduleReconnect();
    } catch {
      if (!closed) scheduleReconnect();
    }
  };

  void connect();
  return () => {
    closed = true;
    if (reconnectTimer !== undefined) cancelTimeout(reconnectTimer);
    controller.abort();
  };
}
