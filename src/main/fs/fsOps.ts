import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { MAX_VIEW_BYTES, type FileContent, type FsEntry } from '@shared/files'

const ALWAYS_HIDDEN = new Set(['.git', 'node_modules', '.DS_Store'])
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

const toPosix = (p: string) => p.split(sep).join('/')

export async function loadIgnore(root: string): Promise<Ignore> {
  const ig = ignore()
  for (const file of ['.gitignore', join('.git', 'info', 'exclude')]) {
    try {
      ig.add(await readFile(join(root, file), 'utf8'))
    } catch {
      // file absent — nothing to add
    }
  }
  return ig
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function listDir(dir: string, root: string, ig: Ignore): Promise<FsEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const out: FsEntry[] = []
  for (const d of dirents) {
    if (ALWAYS_HIDDEN.has(d.name)) continue
    const path = join(dir, d.name)
    const isDir = d.isDirectory() || (d.isSymbolicLink() && (await isDirectory(path)))
    const rel = toPosix(relative(root, path))
    if (rel && ig.ignores(isDir ? `${rel}/` : rel)) continue
    out.push({ name: d.name, path, kind: isDir ? 'dir' : 'file' })
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

export async function readViewable(path: string): Promise<FileContent> {
  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(path)
  } catch {
    return { kind: 'missing' }
  }
  // A directory raises EISDIR; a FIFO would block a libuv thread forever waiting for a writer.
  if (!st.isFile()) return { kind: 'binary', size: st.size }
  const size = st.size
  if (size > MAX_VIEW_BYTES) return { kind: 'too-large', size }
  const buf = await readFile(path)
  const mime = IMAGE_TYPES[extname(path).toLowerCase()]
  if (mime) return { kind: 'image', dataUrl: `data:${mime};base64,${buf.toString('base64')}`, size }
  if (buf.subarray(0, 8000).includes(0)) return { kind: 'binary', size }
  return { kind: 'text', text: buf.toString('utf8'), size }
}
