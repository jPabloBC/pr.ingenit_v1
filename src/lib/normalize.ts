/**
 * Normaliza strings a minúsculas sin acentos para todas las tablas pr_*
 * Ej: "Ingeniería" → "ingenieria", "Año" → "ano"
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (acentos, tildes, etc.)
    .trim()
}

/**
 * Normaliza un array de strings
 */
export function normalizeArray(arr: (string | null | undefined)[]): string[] {
  return arr.map(normalizeText).filter(Boolean)
}

/**
 * Normaliza texto que ya se muestra en MAYÚSCULAS, sin afectar búsqueda ni guardado.
 * Ej: "CANERIA" → "CAÑERIA".
 */
export function normalizeUppercaseDisplayText(value: string | null | undefined): string {
  if (!value) return ''
  return String(value)
    .replace(/\bCANERIA\b/g, 'CAÑERIA')
    .replace(/\bCANERIAS\b/g, 'CAÑERIAS')
}

/**
 * Formatea una especialidad para display en la UI.
 * Normaliza variantes como "Caneria" o "caneria" a "Cañería".
 */
export function prettifySpecialty(value: string | null | undefined): string {
  if (!value) return ''
  // If it's a JSON array stored as string, try to extract a readable form
  let raw = String(value)
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) raw = parsed.join(' ')
    else if (typeof parsed === 'object' && parsed !== null) raw = Object.values(parsed).join(' ')
  } catch (e) {
    // ignore parse errors
  }
    const check = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  // map common variants to the preferred display
  if (check.includes('caneria') || check.includes('canería')) return 'Cañería'

  // Default: title-case each word (preserve accents already present in `raw`)
  return raw
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
