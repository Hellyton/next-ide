/** macOS uses Cmd for app shortcuts; Windows/Linux use Ctrl (Cmd there is the OS's Win/Super key). */
// Outside a browser (unit tests run under Node) keep the macOS behavior the app was built around.
export const isMac: boolean = typeof window !== 'undefined' ? /Mac/i.test(window.navigator.platform) : true

/** The app's shortcut modifier for this keyboard: Cmd on macOS, Ctrl elsewhere. */
export function isModOnly(e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }, mac: boolean = isMac): boolean {
  return mac ? e.metaKey && !e.ctrlKey && !e.altKey : e.ctrlKey && !e.metaKey && !e.altKey
}

/** Label for a shortcut: `⌘S` on macOS, `Ctrl+S` elsewhere. */
export const modLabel = (key: string, mac: boolean = isMac): string => (mac ? `⌘${key}` : `Ctrl+${key}`)
