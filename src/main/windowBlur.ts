import type { BrowserWindow } from 'electron'
import { MAX_BLUR_RADIUS } from '@shared/models'

type Blur = (windowId: number, radius: number) => void

/**
 * macOS has no public API for an adjustable blur behind a window (vibrancy is a fixed material),
 * so this calls the window server directly, as iTerm does. Anything going wrong means no blur.
 */
async function load(): Promise<Blur | null> {
  if (process.platform !== 'darwin') return null
  try {
    const { default: koffi } = await import('koffi')
    const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
    const connection = cg.func('int CGSMainConnectionID()')
    const setRadius = cg.func('int CGSSetWindowBackgroundBlurRadius(int, int, int)')
    return (windowId, radius) => void setRadius(connection(), windowId, radius)
  } catch (err) {
    console.error('[next-ide] window blur unavailable', err)
    return null
  }
}

let blur: Promise<Blur | null> | null = null

/** Blurs what shows through the window's translucent areas; `percent` 0 turns it off. */
export async function setWindowBlur(win: BrowserWindow, percent: number): Promise<void> {
  const apply = await (blur ??= load())
  if (!apply || win.isDestroyed()) return
  // "window:<CGWindowID>:0": the id the window server knows this window by.
  const windowId = Number(win.getMediaSourceId().split(':')[1])
  if (!Number.isInteger(windowId)) return
  try {
    apply(windowId, Math.round((percent / 100) * MAX_BLUR_RADIUS))
  } catch (err) {
    console.error('[next-ide] failed to set window blur', err)
  }
}
