/** Stamped by electron.vite.config.ts at build time, so the sidebar shows which build is running. */
export type BuildInfo = { version: string; commit: string | null; dirty: boolean; builtAt: string }

const pad = (n: number) => String(n).padStart(2, '0')

export function formatBuildInfo(info: BuildInfo): string {
  const d = new Date(info.builtAt)
  const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const commit = info.commit ? ` · ${info.commit}${info.dirty ? '+' : ''}` : ''
  return `v${info.version}${commit} · ${when}`
}
