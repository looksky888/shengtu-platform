async () => {
  // The 25-field layout is pinned to the reference commit in THIRD_PARTY.md.
  // Values describing the browser come from this page, not a second simulated environment.
  const scripts = Array.from(document.scripts).map(s => s.src).filter(Boolean);
  if (!scripts.length) throw new Error("page scripts not ready");
  const perf = performance.now();
  const fields = [
    screen.width + screen.height, new Date().toString(), 4294705152, 1,
    navigator.userAgent, scripts[0], document.documentElement.getAttribute("data-build") || "",
    navigator.language, navigator.languages.join(","), 0,
    "hardwareConcurrency−" + navigator.hardwareConcurrency, "location", "navigator",
    perf, crypto.randomUUID(), "", navigator.hardwareConcurrency, performance.timeOrigin,
    0, 0, 0, 0, 0, 0, 0,
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(fields));
  const p = "gAAAAAC" + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
  const ua = navigator.userAgentData;
  const high = ua ? await ua.getHighEntropyValues(["architecture", "bitness", "platformVersion", "fullVersionList", "uaFullVersion"]) : null;
  const brands = items => items.map(b => `"${b.brand}";v="${b.version}"`).join(", ");
  const fallbackPlatform = /Windows/i.test(navigator.userAgent)
    ? "Windows"
    : (/Macintosh|Mac OS X/i.test(navigator.userAgent) ? "macOS" : "Linux");
  const headers = ua && high ? {
    "sec-ch-ua": brands(ua.brands), "sec-ch-ua-mobile": ua.mobile ? "?1" : "?0",
    "sec-ch-ua-platform": JSON.stringify(ua.platform || fallbackPlatform),
    "sec-ch-ua-arch": JSON.stringify(high.architecture), "sec-ch-ua-bitness": JSON.stringify(high.bitness),
    "sec-ch-ua-platform-version": JSON.stringify(high.platformVersion),
    "sec-ch-ua-full-version": JSON.stringify(high.uaFullVersion),
    "sec-ch-ua-full-version-list": brands(high.fullVersionList),
  } : {
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": JSON.stringify(fallbackPlatform),
  };
  return {p, user_agent: navigator.userAgent, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone_offset_min: new Date().getTimezoneOffset(), language: navigator.language, headers};
}
