import { createMiddleware } from "@tanstack/react-start";

export const PORTAL_SESSION_STORAGE_KEY = "sace_portal_session_token";

let inMemorySessionToken: string | null = null;

export function getClientSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(PORTAL_SESSION_STORAGE_KEY);
    if (stored) {
      inMemorySessionToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return null;
}

export function setClientSessionToken(token: string | null): void {
  inMemorySessionToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.sessionStorage.setItem(PORTAL_SESSION_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(PORTAL_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
}

/**
 * Attaches the server-signed portal session token as a request header on
 * TanStack Start serverFn RPCs so authentication works reliably inside
 * cross-site preview iframes even when third-party cookies are blocked.
 */
export const attachPortalSession = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = getClientSessionToken();
    return next({
      headers: token ? { "x-sace-session": token } : {},
    });
  },
);
