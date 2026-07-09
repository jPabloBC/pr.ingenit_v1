const BLOCKED_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link',
  'meta',
]

export const escapeHtml = (value: unknown) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const isSafeHttpUrl = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return false
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export const isSafeImageContentType = (value: unknown) => {
  const contentType = String(value || '').trim().toLowerCase()
  return [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/heic',
    'image/heif',
  ].includes(contentType)
}

export function sanitizeHtmlForPdf(html: string) {
  let output = String(html || '')

  for (const tag of BLOCKED_TAGS) {
    output = output.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }

  output = output
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(href|src|xlink:href)\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/\s+(href|src|xlink:href)\s*=\s*'javascript:[^']*'/gi, '')
    .replace(/\s+(href|src|xlink:href)\s*=\s*javascript:[^\s>]+/gi, '')
    .replace(/\s+style\s*=\s*"[^"]*expression\s*\([^"]*"/gi, '')
    .replace(/\s+style\s*=\s*'[^']*expression\s*\([^']*'/gi, '')

  return output
}
