/**
 * Windows paths come back from Node and the OS with backslashes; the renderer compares and splits
 * paths on '/'. Node accepts forward slashes on Windows too, so paths crossing into the renderer
 * are spelled with '/' everywhere (a no-op on macOS/Linux, where '\' is a legal file name char).
 */
export function toSlash(p: string, platform: string = typeof process !== 'undefined' ? process.platform : ''): string {
  return platform === 'win32' ? p.replace(/\\/g, '/') : p
}
