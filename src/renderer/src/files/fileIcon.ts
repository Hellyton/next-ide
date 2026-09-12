export type IconKind = 'folder' | 'folder-open' | 'code' | 'config' | 'doc' | 'image' | 'file'
export type FileIconSpec = { kind: IconKind; color: string }

const FOLDER = '#7aa2f7'
const DEFAULT = '#9aa0a6'

/** Colors follow VS Code's file icon themes closely enough to be recognizable. */
const BY_EXT: Record<string, [IconKind, string]> = {
  ts: ['code', '#3178c6'], mts: ['code', '#3178c6'], cts: ['code', '#3178c6'], tsx: ['code', '#3178c6'],
  js: ['code', '#f7df1e'], mjs: ['code', '#f7df1e'], cjs: ['code', '#f7df1e'], jsx: ['code', '#f7df1e'],
  json: ['config', '#f5b942'], jsonc: ['config', '#f5b942'], lock: ['config', '#8d8d8d'],
  yml: ['config', '#a3b3cc'], yaml: ['config', '#a3b3cc'], toml: ['config', '#9ca3af'], ini: ['config', '#9ca3af'],
  env: ['config', '#eab308'], properties: ['config', '#9ca3af'], xml: ['config', '#ff9800'],
  md: ['doc', '#5b9dd9'], mdx: ['doc', '#5b9dd9'], txt: ['doc', '#9aa0a6'], csv: ['doc', '#89e051'],
  pdf: ['doc', '#e5252a'], doc: ['doc', '#2b579a'], docx: ['doc', '#2b579a'],
  css: ['code', '#42a5f5'], scss: ['code', '#c6538c'], less: ['code', '#2a4d80'],
  html: ['code', '#e44d26'], htm: ['code', '#e44d26'], vue: ['code', '#41b883'], svelte: ['code', '#ff3e00'],
  py: ['code', '#4b8bbe'], java: ['code', '#e76f00'], kt: ['code', '#a97bff'], kts: ['code', '#a97bff'],
  go: ['code', '#00add8'], rs: ['code', '#dea584'], rb: ['code', '#cc342d'], php: ['code', '#8993be'],
  c: ['code', '#659ad2'], h: ['code', '#659ad2'], cc: ['code', '#f34b7d'], cpp: ['code', '#f34b7d'], hpp: ['code', '#f34b7d'],
  cs: ['code', '#68217a'], swift: ['code', '#f05138'], lua: ['code', '#000080'], sql: ['code', '#e38c00'],
  graphql: ['code', '#e10098'], gql: ['code', '#e10098'], prisma: ['code', '#0c344b'],
  sh: ['code', '#89e051'], bash: ['code', '#89e051'], zsh: ['code', '#89e051'], fish: ['code', '#89e051'],
  png: ['image', '#a074c4'], jpg: ['image', '#a074c4'], jpeg: ['image', '#a074c4'], gif: ['image', '#a074c4'],
  webp: ['image', '#a074c4'], ico: ['image', '#a074c4'], icns: ['image', '#a074c4'], svg: ['image', '#ff9800'],
}

const BY_NAME: Record<string, [IconKind, string]> = {
  dockerfile: ['config', '#2496ed'],
  makefile: ['config', '#9ca3af'],
  '.gitignore': ['config', '#f05033'],
  '.gitattributes': ['config', '#f05033'],
  '.env': ['config', '#eab308'],
  'package.json': ['config', '#8bc500'],
  'package-lock.json': ['config', '#8d8d8d'],
  'tsconfig.json': ['config', '#3178c6'],
}

export function fileIcon(name: string, isDir: boolean, open = false): FileIconSpec {
  if (isDir) return { kind: open ? 'folder-open' : 'folder', color: FOLDER }
  const lower = name.toLowerCase()
  const byName = BY_NAME[lower] ?? (lower.startsWith('dockerfile') ? BY_NAME.dockerfile : undefined)
  if (byName) return { kind: byName[0], color: byName[1] }
  const dot = lower.lastIndexOf('.')
  const byExt = dot > 0 ? BY_EXT[lower.slice(dot + 1)] : undefined
  return byExt ? { kind: byExt[0], color: byExt[1] } : { kind: 'file', color: DEFAULT }
}
