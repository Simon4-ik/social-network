export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text() as any;
}

export async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/api/upload`, { method: "POST", credentials: "include", body: fd });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.path as string;
}

export function mediaURL(path?: string | null) {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${API}${path}`;
}
