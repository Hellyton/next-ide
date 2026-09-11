import type { ImageAttachment, ImageMediaType } from '@shared/agent'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const SUPPORTED = new Set<string>(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function validateImage(file: { name: string; type: string; size: number }): string | null {
  if (!SUPPORTED.has(file.type)) return `${file.name}: formato não suportado (use png, jpg, gif ou webp)`
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: maior que 5 MB`
  return null
}

export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

export function pickImageFiles(files: ArrayLike<File> | null | undefined): File[] {
  return files ? Array.from(files).filter((f) => f.type.startsWith('image/')) : []
}

export function canSend(input: { text: string; images: number; reading: number }): boolean {
  return input.reading === 0 && (input.text.trim().length > 0 || input.images > 0)
}

export function readImage(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`falha ao ler ${file.name}`))
    reader.onload = () => resolve({ name: file.name, mediaType: file.type as ImageMediaType, data: stripDataUrl(String(reader.result)) })
    reader.readAsDataURL(file)
  })
}
