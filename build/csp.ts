// Production-only CSP: dev (Vite HMR) needs inline scripts, so this is injected at build time.
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

export function injectCsp(html: string): string {
  return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`)
}
