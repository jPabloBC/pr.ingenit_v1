export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export const cleanUuid = (value: unknown) => {
  const text = String(value || '').trim()
  return UUID_RE.test(text) ? text : ''
}

export const cleanYmd = (value: unknown) => {
  const text = String(value || '').trim().slice(0, 10)
  return YMD_RE.test(text) ? text : ''
}

export const cleanPostgrestSearch = (value: unknown, maxLength = 80) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/[,%(){}[\]"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
