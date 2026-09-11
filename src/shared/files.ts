export type FsEntry = { name: string; path: string; kind: 'dir' | 'file' }
export type GitFileStatus = 'M' | 'A' | 'D' | 'U' | 'R'
export type FileContent =
  | { kind: 'text'; text: string; size: number }
  | { kind: 'image'; dataUrl: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number }
  | { kind: 'missing' }
  | { kind: 'forbidden' }
export const MAX_VIEW_BYTES = 2 * 1024 * 1024
