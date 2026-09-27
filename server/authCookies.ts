import {createHash, timingSafeEqual} from "node:crypto";
import type express from "express";

export const SESSION_COOKIE_NAME = "gpu_erp_session";
export const CSRF_HEADER_NAME = "x-csrf-token";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function cookieSecure() {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function cookieOptions(): express.CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export function getCookie(req: express.Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function getSessionCookie(req: express.Request) {
  return getCookie(req, SESSION_COOKIE_NAME);
}

export function setSessionCookie(res: express.Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
}

export function clearSessionCookie(res: express.Response) {
  const {maxAge: _maxAge, ...options} = cookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, options);
}

export function createCsrfToken(sessionToken: string) {
  return createHash("sha256").update(`gpu-erp-csrf-v1:${sessionToken}`).digest("hex");
}

export function csrfTokenMatches(sessionToken: string, candidate: string | undefined) {
  if (!candidate) return false;
  const expected = Buffer.from(createCsrfToken(sessionToken));
  const actual = Buffer.from(candidate);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
