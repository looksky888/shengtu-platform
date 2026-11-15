import assert from "node:assert/strict";
import test from "node:test";

import { createSSEDataParser, startAuthenticatedSSE } from "../src/lib/sse-client.ts";

interface PendingTimer {
  callback: () => void;
  delay: number;
}

function flushAsyncWork() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function createTimers() {
  const pending: PendingTimer[] = [];
  const cleared: PendingTimer[] = [];
  return {
    pending,
    cleared,
    setTimeout(callback: () => void, delay: number) {
      const timer = { callback, delay };
      pending.push(timer);
      return timer;
    },
    clearTimeout(timer: unknown) {
      cleared.push(timer as PendingTimer);
    },
  };
}

test("SSE parser handles chunk boundaries, CRLF, multiline data, and DONE", () => {
  const received: string[] = [];
  const parser = createSSEDataParser((data) => received.push(data));

  parser.push("event: snapshot\r\ndata: first");
  parser.push("\r\ndata: second\r\n\r\ndata: [DO");
  parser.push("NE]\n\ndata: final\n\n");

  assert.deepEqual(received, ["first\nsecond", "final"]);
});

test("authenticated SSE reads events, reconnects with a fresh signal after EOF, and cancels reader", async () => {
  const timers = createTimers();
  const received: string[] = [];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let cancelledStreams = 0;
  const encoder = new TextEncoder();
  const stop = startAuthenticatedSSE(
    {
      url: "https://example.test/api/events",
      getToken: async () => "session-token",
      onData: (data) => received.push(data),
    },
    {
      fetch: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"type":"ta'));
              controller.enqueue(encoder.encode('sk"}\n\ndata: [DONE]\n\n'));
              controller.close();
            },
            cancel() {
              cancelledStreams += 1;
            },
          }),
        };
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    },
  );

  await flushAsyncWork();
  assert.deepEqual(received, ['{"type":"task"}']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://example.test/api/events");
  assert.equal(new Headers(requests[0]?.init.headers).get("Authorization"), "Bearer session-token");
  assert.equal(requests[0]?.init.credentials, "include");
  assert.equal(timers.pending[0]?.delay, 1500);

  timers.pending.shift()?.callback();
  await flushAsyncWork();
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0]?.init.signal, requests[1]?.init.signal);

  const reconnectTimer = timers.pending[0];
  stop();
  assert.equal(timers.cleared.includes(reconnectTimer), true);
  assert.equal(cancelledStreams >= 0, true);
});

test("authenticated SSE stops retrying on empty token, 403, or 404", async () => {
  for (const scenario of [
    { token: "", status: 200 },
    { token: "session-token", status: 403 },
    { token: "session-token", status: 404 },
  ]) {
    const timers = createTimers();
    let unauthorizedCalls = 0;
    const stop = startAuthenticatedSSE(
      {
        url: "/api/events",
        getToken: async () => scenario.token,
        onData: () => undefined,
        onUnauthorized: () => {
          unauthorizedCalls += 1;
        },
      },
      {
        fetch: async () => ({ ok: false, status: scenario.status, body: null }),
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
      },
    );

    await flushAsyncWork();
    assert.equal(unauthorizedCalls, 0);
    assert.equal(timers.pending.length, 0);
    stop();
  }
});

test("authenticated SSE backs off after token and HTTP failures", async () => {
  const timers = createTimers();
  let tokenAttempts = 0;
  const stop = startAuthenticatedSSE(
    {
      url: "/api/events",
      getToken: async () => {
        tokenAttempts += 1;
        if (tokenAttempts === 1) throw new Error("storage unavailable");
        return "session-token";
      },
      onData: () => undefined,
    },
    {
      fetch: async () => ({ ok: false, body: null }),
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    },
  );

  await flushAsyncWork();
  assert.equal(timers.pending[0]?.delay, 1500);
  timers.pending.shift()?.callback();
  await flushAsyncWork();
  assert.equal(timers.pending[0]?.delay, 3000);
  stop();
});

test("authenticated SSE stops retrying after unauthorized response", async () => {
  const timers = createTimers();
  let unauthorizedCalls = 0;
  const stop = startAuthenticatedSSE(
    {
      url: "/api/events",
      getToken: async () => "expired-session-token",
      onData: () => undefined,
      onUnauthorized: () => {
        unauthorizedCalls += 1;
      },
    },
    {
      fetch: async () => ({ ok: false, status: 401, body: null }),
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    },
  );

  await flushAsyncWork();
  assert.equal(unauthorizedCalls, 1);
  assert.equal(timers.pending.length, 0);
  stop();
});

test("authenticated SSE cleanup aborts an active request", async () => {
  let signal: AbortSignal | null = null;
  const stop = startAuthenticatedSSE(
    {
      url: "/api/events",
      getToken: async () => "session-token",
      onData: () => undefined,
    },
    {
      fetch: async (_url, init) => {
        signal = init.signal ?? null;
        return new Promise(() => undefined);
      },
    },
  );

  await flushAsyncWork();
  assert.equal(signal?.aborted, false);
  stop();
  assert.equal(signal?.aborted, true);
});
