import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { toSlash } from '@shared/slash'

/** Removes trailing commas outside strings, tracking escapes and string boundaries. */
function removeTrailingCommas(src: string): string {
  let out = ''
  let inString = false
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (inString) {
      out += c
      if (c === '\\') {
        out += src[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === '"') inString = false
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === ',') {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j]!)) j++
      if (j < src.length && (src[j] === '}' || src[j] === ']')) {
        i = j
        continue
      }
      out += c
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

/** Removes // and /* *\/ comments outside strings, then trailing commas. */
export function stripJsonc(src: string): string {
  let out = ''
  let inString = false
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    const next = src[i + 1]
    if (inString) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (c === '"') inString = false
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  return removeTrailingCommas(out)
}

export function parseCodeWorkspace(json: string, filePath: string): { name: string; paths: string[] } {
  const data = JSON.parse(stripJsonc(json)) as { folders?: Array<{ path?: unknown }> }
  const base = dirname(filePath)
  const paths = (data.folders ?? [])
    .map((f) => f.path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => toSlash(isAbsolute(p) ? p : resolve(base, p)))
  return { name: basename(filePath).replace(/\.code-workspace$/, ''), paths }
}
