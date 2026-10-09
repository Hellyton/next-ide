import { describe, expect, it } from 'vitest'
import { fileMention, insertMentions, splitFiles } from '@renderer/agent/attachments'

describe('splitFiles', () => {
  it('sends supported small images inline and everything else as a path', () => {
    const png = { name: 'a.png', type: 'image/png', size: 10 }
    const huge = { name: 'b.png', type: 'image/png', size: 50 * 1024 * 1024 }
    const pdf = { name: 'c.pdf', type: 'application/pdf', size: 10 }
    const csv = { name: 'd.csv', type: 'text/csv', size: 10 }
    const xlsx = { name: 'e.xlsx', type: '', size: 10 }
    expect(splitFiles([png, huge, pdf, csv, xlsx])).toEqual({ images: [png], others: [huge, pdf, csv, xlsx] })
  })
})

describe('fileMention', () => {
  it('is relative inside the project, absolute outside, quoted with spaces', () => {
    expect(fileMention('/p', '/p/data/x.csv')).toBe('@data/x.csv')
    expect(fileMention('/p', '/Users/me/Downloads/r.pdf')).toBe('@/Users/me/Downloads/r.pdf')
    expect(fileMention('/p', '/Users/me/Relatório final.xlsx')).toBe('@"/Users/me/Relatório final.xlsx"')
  })
})

describe('insertMentions', () => {
  it('pads with spaces and moves the caret past the insert', () => {
    expect(insertMentions('', 0, ['@a.pdf'])).toEqual({ text: '@a.pdf ', caret: 7 })
    expect(insertMentions('veja', 4, ['@a.pdf', '@b.csv'])).toEqual({ text: 'veja @a.pdf @b.csv ', caret: 19 })
    expect(insertMentions('veja  agora', 5, ['@a.pdf'])).toEqual({ text: 'veja @a.pdf agora', caret: 11 })
    expect(insertMentions('x', 1, [])).toEqual({ text: 'x', caret: 1 })
  })
})
