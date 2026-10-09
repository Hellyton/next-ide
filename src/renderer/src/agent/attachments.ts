import { formatMention } from './mentions'
import { validateImage } from './images'

/**
 * Splits dropped/picked files: images the model can see inline go as image attachments;
 * everything else (pdf, xlsx, csv, too-big images…) goes as an @path the agent reads with
 * its tools — what the Claude Code CLI does when a file is dropped on the terminal.
 */
export function splitFiles<F extends { name: string; type: string; size: number }>(files: F[]): { images: F[]; others: F[] } {
  const images: F[] = []
  const others: F[] = []
  for (const f of files) (validateImage(f) === null ? images : others).push(f)
  return { images, others }
}

/**
 * `@src/a.ts` inside the project, `@/abs/path` outside; quoted when the path has spaces (the CLI's `@"…"`).
 * Null when the name could not stay one token: a quote or a line break in a file name would end the
 * mention early and leave the rest of the name in the prompt as if the user had typed it.
 */
export function fileMention(projectPath: string, absPath: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (/["\x00-\x1f\x7f\u2028\u2029]/.test(absPath)) return null
  const mention = formatMention(projectPath, absPath)
  return /\s/.test(mention) ? `@"${mention.slice(1)}"` : mention
}

/** Inserts mentions at the caret, padded with spaces so they stay separate tokens. */
export function insertMentions(text: string, caret: number, mentions: string[]): { text: string; caret: number } {
  if (mentions.length === 0) return { text, caret }
  const at = Math.max(0, Math.min(caret, text.length))
  const before = text.slice(0, at)
  const after = text.slice(at)
  const chunk = `${before && !/\s$/.test(before) ? ' ' : ''}${mentions.join(' ')}${after.startsWith(' ') ? '' : ' '}`
  return { text: before + chunk + after, caret: at + chunk.length }
}
