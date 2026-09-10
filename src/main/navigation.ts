/**
 * Decides whether an in-window navigation (`will-navigate` / `will-redirect`) is allowed.
 *
 * Only a reload of the exact same URL the window is already on is allowed. Anything else —
 * a different path, a different origin, a dropped `file://` link, a redirect chain — is denied,
 * so the preload script (with `pty:*` access) can never be re-injected into an untrusted page.
 */
export function isAllowedNavigation(targetUrl: string, currentUrl: string): boolean {
  return targetUrl === currentUrl
}
