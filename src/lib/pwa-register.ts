// The only place that registers the app-shell service worker.
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const LOVABLE_HOSTS = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];

export function isRefusedHost(hostname: string, search = ""): boolean {
  const h = hostname.toLowerCase();
  if (new URLSearchParams(search).get("sw") === "off") return true;
  const label = h.split(".")[0] ?? "";
  if (LOVABLE_HOSTS.some((d) => h.endsWith(d))) {
    if (PREVIEW_LABEL.test(label)) return true;
    if (/^project--[a-z0-9-]+-dev$/.test(label)) return true;
  }
  for (const d of ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]) {
    if (h === d || h.endsWith("." + d)) return true;
  }
  return h === "localhost" || h === "127.0.0.1";
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.filter((r) => r.active?.scriptURL.endsWith("/sw.js") || r.installing?.scriptURL.endsWith("/sw.js") || r.waiting?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister()),
  );
}

export async function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  let inIframe = true;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (!import.meta.env.PROD || inIframe || isRefusedHost(window.location.hostname, window.location.search)) {
    await unregisterAppSw();
    return;
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
