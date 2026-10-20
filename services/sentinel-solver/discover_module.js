// PR418 module-graph discovery with bounded requests and explicit origin checks.
async (maxChunks) => {
  const allowed = new Set([location.origin, "https://cdn.oaistatic.com"]);
  const target = /\/turnstile-[A-Za-z0-9_-]+\.js$/;
  const specifier = /["'`]((?:https:\/\/|\.{0,2}\/)?[A-Za-z0-9_./-]+\.js)["'`]/g;
  const queue = [];
  const seen = new Set();
  const push = (raw, base) => {
    try {
      const url = new URL(raw, base);
      if (!allowed.has(url.origin) || seen.has(url.href) || !url.pathname.endsWith(".js")) return;
      if (seen.size >= 1000) return;
      seen.add(url.href);
      queue.push(url.href);
    } catch (_) { /* Ignore malformed references in upstream bundles. */ }
  };
  document.querySelectorAll("script[src],link[href]").forEach(node => push(node.src || node.href, location.href));
  performance.getEntriesByType("resource").forEach(entry => push(entry.name, location.href));
  let fetched = 0;
  const deadline = performance.now() + 15000;
  while (queue.length && fetched < maxChunks && performance.now() < deadline) {
    const preferred = queue.findIndex(url => /sentinel|prewarm|turnstile/i.test(url));
    const url = queue.splice(preferred < 0 ? 0 : preferred, 1)[0];
    if (target.test(new URL(url).pathname)) return url;
    fetched++;
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(2000), redirect: "error"});
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length > 4000000) continue;
      specifier.lastIndex = 0;
      let match;
      while ((match = specifier.exec(text)) !== null) {
        push(match[1], match[1].startsWith("/") ? location.href : url);
      }
    } catch (_) { /* A missing chunk does not invalidate other graph branches. */ }
  }
  return null;
}
