export const SUPPORTED_LANGS = [
  'typescript', 'tsx', 'javascript', 'jsx', 'json', 'jsonc', 'markdown', 'css', 'scss', 'html', 'vue', 'svelte',
  'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'csharp', 'ruby', 'php', 'lua',
  'yaml', 'toml', 'ini', 'xml', 'sql', 'graphql', 'prisma', 'shellscript', 'dockerfile', 'make', 'diff',
] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

const BY_EXT: Record<string, SupportedLang> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', jsonc: 'jsonc', md: 'markdown', mdx: 'markdown',
  css: 'css', scss: 'scss', html: 'html', htm: 'html', vue: 'vue', svelte: 'svelte',
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', lua: 'lua',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', xml: 'xml', svg: 'xml', sql: 'sql',
  graphql: 'graphql', gql: 'graphql', prisma: 'prisma',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', diff: 'diff', patch: 'diff',
}
const BY_NAME: Record<string, SupportedLang> = {
  makefile: 'make', 'tsconfig.json': 'jsonc', '.env': 'ini', '.zshrc': 'shellscript', '.bashrc': 'shellscript',
}

export function langForPath(path: string): SupportedLang | 'text' {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const byName = BY_NAME[name]
  if (byName) return byName
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  const dot = name.lastIndexOf('.')
  return dot > 0 ? (BY_EXT[name.slice(dot + 1)] ?? 'text') : 'text'
}
