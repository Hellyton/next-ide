/** macOS uses Cmd for app shortcuts; Windows/Linux use Ctrl (Cmd there is the OS's Win/Super key). */
// Outside a browser (unit tests run under Node) keep the macOS behavior the app was built around.
const platform: string | undefined = typeof window !== 'undefined' ? window.navigator?.platform : undefined
export const isMac: boolean = platform === undefined || /Mac/i.test(platform)

/** The app's shortcut modifier for this keyboard: Cmd on macOS, Ctrl elsewhere. */
export function isModOnly(e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }, mac: boolean = isMac): boolean {
  return mac ? e.metaKey && !e.ctrlKey && !e.altKey : e.ctrlKey && !e.metaKey && !e.altKey
}

/** Label for a shortcut: `⌘S` on macOS, `Ctrl+S` elsewhere. */
export const modLabel = (key: string, mac: boolean = isMac): string => (mac ? `⌘${key}` : `Ctrl+${key}`)

/** Windows (the terminal there is PowerShell, see main/pty/spawnShell.ts). */
export const isWindows: boolean = platform !== undefined && /Win/i.test(platform)
