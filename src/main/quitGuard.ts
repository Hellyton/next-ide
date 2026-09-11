export type QuitGuardDeps<W> = {
  hasBusy(): boolean
  /** True when confirmation is disabled (E2E). */
  skipConfirm(): boolean
  /** Shows the busy-agents dialog; true means "Sair". `parent` is undefined when no window is left. */
  ask(parent: W | undefined): boolean
}

/**
 * Decides whether closing the window / quitting may proceed while agents are busy.
 * Once the user confirms (from either path) we never ask again, so closing the window
 * and the quit it triggers only show one dialog.
 */
export function createQuitGuard<W>(deps: QuitGuardDeps<W>) {
  let confirmed = false
  const allow = (parent: W | undefined): boolean => {
    if (confirmed || deps.skipConfirm() || !deps.hasBusy()) return true
    if (!deps.ask(parent)) return false
    confirmed = true
    return true
  }
  return {
    allowWindowClose: (win: W): boolean => allow(win),
    allowQuit: (win: W | undefined): boolean => allow(win),
  }
}
