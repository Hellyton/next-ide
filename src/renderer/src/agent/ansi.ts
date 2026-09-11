export type AnsiSpan = { text: string; color?: string; bold?: boolean; dim?: boolean }

const BASIC = ['#404040', '#f87171', '#4ade80', '#facc15', '#60a5fa', '#c084fc', '#22d3ee', '#e5e5e5']
const BRIGHT = ['#737373', '#fca5a5', '#86efac', '#fde047', '#93c5fd', '#d8b4fe', '#67e8f9', '#ffffff']

function color256(n: number): string {
  if (n < 8) return BASIC[n]!
  if (n < 16) return BRIGHT[n - 8]!
  if (n < 232) {
    const i = n - 16
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return `rgb(${level(Math.floor(i / 36))},${level(Math.floor((i % 36) / 6))},${level(i % 6)})`
  }
  const gray = 8 + (n - 232) * 10
  return `rgb(${gray},${gray},${gray})`
}

type Style = Omit<AnsiSpan, 'text'>

function applyCodes(style: Style, codes: number[]): Style {
  let next: Style = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!
    if (c === 0) next = {}
    else if (c === 1) next.bold = true
    else if (c === 2) next.dim = true
    else if (c === 22) {
      delete next.bold
      delete next.dim
    } else if (c === 39) delete next.color
    else if (c >= 30 && c <= 37) next.color = BASIC[c - 30]
    else if (c >= 90 && c <= 97) next.color = BRIGHT[c - 90]
    else if (c === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
      next.color = color256(codes[i + 2]!)
      i += 2
    } else if (c === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
      next.color = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
      i += 4
    }
  }
  return next
}

export function ansiToSpans(text: string): AnsiSpan[] {
  const spans: AnsiSpan[] = []
  let style: Style = {}
  const re = /\x1b\[([0-9;]*)m/g
  let last = 0
  let match: RegExpExecArray | null
  const pushText = (chunk: string) => {
    if (chunk) spans.push({ text: chunk, ...style })
  }
  while ((match = re.exec(text))) {
    pushText(text.slice(last, match.index))
    style = applyCodes(style, match[1] ? match[1].split(';').map(Number) : [0])
    last = re.lastIndex
  }
  pushText(text.slice(last))
  return spans
}
