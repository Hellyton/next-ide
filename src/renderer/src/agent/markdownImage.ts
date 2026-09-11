import { defaultUrlTransform } from 'react-markdown'

export type MarkdownImageMode = 'inline' | 'link'

const DATA_IMAGE = /^data:image\//i

/**
 * Agent markdown must never make the renderer fetch a remote URL (tracking pixels, leaking
 * that a transcript was opened). Only embedded `data:image/...` sources are drawn inline;
 * everything else becomes a plain link the user can choose to open externally.
 */
export function markdownImageMode(src: string | undefined): MarkdownImageMode {
  return src && DATA_IMAGE.test(src.trim()) ? 'inline' : 'link'
}

/** react-markdown's default sanitizer drops `data:` URLs; keep them for inline images only. */
export function markdownUrlTransform(url: string, key: string): string {
  return key === 'src' && markdownImageMode(url) === 'inline' ? url : defaultUrlTransform(url)
}
