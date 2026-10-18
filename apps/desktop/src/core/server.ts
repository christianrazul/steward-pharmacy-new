import type { EnrollResponse, PullResponse } from "@steward/sync";

/** What went wrong talking to the server, in words a cashier can act on. */
export class ServerError extends Error {
  override name = "ServerError";
  constructor(
    readonly kind: "offline" | "revoked" | "rejected" | "server",
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Normalizes what was typed during enrollment: "pos.example.ph/api" → "https://pos.example.ph/api". */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  // Plain HTTP only for a server on this machine (development).
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new ServerError("rejected", "Use the https:// address of the Steward server.", {
      serverUrl: "Use an https:// address.",
    });
  }
  return url.toString().replace(/\/+$/, "");
}

async function send<T>(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ServerError(
      "offline",
      "Can’t reach the server. Check the internet connection and try again.",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body as T;
  const error =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error: { message?: string; fields?: Record<string, string> } }).error
      : {};
  if (response.status === 401) {
    throw new ServerError(
      "revoked",
      error.message ?? "This device was revoked. Ask your admin to add it again.",
    );
  }
  if (response.status >= 400 && response.status < 500) {
    throw new ServerError(
      "rejected",
      error.message ?? "The server refused the request.",
      error.fields ?? {},
    );
  }
  throw new ServerError("server", "The server had a problem. Try again in a moment.");
}

export function enroll(serverUrl: string, code: string, fetchImpl: typeof fetch = fetch) {
  return send<EnrollResponse>(
    `${serverUrl}/devices/enroll`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    },
    fetchImpl,
  );
}

export function pullPage(
  serverUrl: string,
  token: string,
  cursor: number,
  fetchImpl: typeof fetch = fetch,
) {
  return send<PullResponse>(
    `${serverUrl}/sync/pull?cursor=${cursor}&limit=500`,
    { headers: { authorization: `Bearer ${token}` } },
    fetchImpl,
  );
}
