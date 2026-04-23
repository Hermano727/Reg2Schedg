const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function normalizeApiBaseUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const host = trimmed.split("/")[0]?.toLowerCase() ?? "";
  const hostname = host.split(":")[0] ?? "";
  const scheme = LOCAL_HOSTS.has(hostname) ? "http" : "https";
  return `${scheme}://${trimmed}`;
}

export function getApiBaseUrl(): string {
  const configured = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  if (configured) return configured;

  if (typeof window !== "undefined" && !LOCAL_HOSTS.has(window.location.hostname)) {
    return window.location.origin;
  }

  return DEFAULT_API_ORIGIN;
}
