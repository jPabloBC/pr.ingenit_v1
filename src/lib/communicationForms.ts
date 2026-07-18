export type CommunicationFormQuestion = {
  id: string
  prompt: string
  type: 'single_choice' | 'multiple_choice' | 'text'
  required: boolean
  options: string[]
}

export type CommunicationFormCondition = {
  question_id: string
  operator: 'equals' | 'includes'
  value: string
}

export type CommunicationFormResult = {
  id: string
  title: string
  description: string
  file_key: string
  file_name: string
  content_type: string
  size_bytes: number
  conditions: CommunicationFormCondition[]
  is_default: boolean
}

export type CommunicationFormIdentity = {
  first_names: string
  last_names: string
  rut: string
  position: string
  shift: string
}

export const COMMUNICATION_FORM_MAX_FILE_BYTES = 100 * 1024 * 1024

export const COMMUNICATION_FORM_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
])

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
}

export const resolveCommunicationFormContentType = (fileName: unknown, contentType: unknown) => {
  const provided = String(contentType || '').trim().toLowerCase()
  if (COMMUNICATION_FORM_CONTENT_TYPES.has(provided)) return provided
  const normalizedName = String(fileName || '').trim().toLowerCase()
  const extension = Object.keys(CONTENT_TYPE_BY_EXTENSION).find((candidate) => normalizedName.endsWith(candidate))
  return extension ? CONTENT_TYPE_BY_EXTENSION[extension] : ''
}

const clean = (value: unknown) => String(value || '').trim()
const cleanUppercase = (value: unknown) => clean(value).replace(/\s+/g, ' ').toLocaleUpperCase('es-CL')

export const formatCommunicationFormRut = (value: unknown) => {
  const normalized = clean(value).replace(/[^0-9kK]/g, '').toUpperCase()
  if (normalized.length < 2) return normalized
  const body = normalized.slice(0, -1)
  const verifier = normalized.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${verifier}`
}

export const validateCommunicationFormIdentity = (value: unknown): CommunicationFormIdentity => {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const identity: CommunicationFormIdentity = {
    first_names: cleanUppercase(raw.first_names).slice(0, 120),
    last_names: cleanUppercase(raw.last_names).slice(0, 120),
    rut: formatCommunicationFormRut(raw.rut),
    position: cleanUppercase(raw.position).slice(0, 160),
    shift: cleanUppercase(raw.shift).slice(0, 80),
  }
  if (!identity.first_names || !identity.last_names || !identity.rut || !identity.position || !identity.shift) {
    throw new Error('Completa nombres, apellidos, RUT, cargo y turno.')
  }
  const normalizedRut = identity.rut.replace(/[^0-9K]/g, '')
  if (normalizedRut.length < 8 || normalizedRut.length > 9) throw new Error('Ingresa un RUT válido.')
  const body = normalizedRut.slice(0, -1)
  const verifier = normalizedRut.slice(-1)
  if (!/^\d{7,8}$/.test(body)) throw new Error('Ingresa un RUT válido.')
  let sum = 0
  let multiplier = 2
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const remainder = sum % 11
  const expected = remainder === 0 ? '0' : remainder === 1 ? 'K' : String(11 - remainder)
  if (verifier !== expected) throw new Error('Ingresa un RUT válido.')
  return identity
}

export const normalizeQuestions = (value: unknown): CommunicationFormQuestion[] => {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((question, index) => {
    const raw = question && typeof question === 'object' ? question as Record<string, unknown> : {}
    const type = clean(raw.type)
    const normalizedType: CommunicationFormQuestion['type'] = type === 'text' || type === 'multiple_choice' ? type : 'single_choice'
    const options = Array.from(new Set((Array.isArray(raw.options) ? raw.options : []).map(clean).filter(Boolean))).slice(0, 20)
    return {
      id: clean(raw.id) || `question-${index + 1}`,
      prompt: clean(raw.prompt).slice(0, 300),
      type: normalizedType,
      required: raw.required !== false,
      options: normalizedType === 'text' ? [] : options,
    }
  }).filter((question) => question.prompt && (question.type === 'text' || question.options.length >= 2))
}

export const normalizeResults = (value: unknown, validQuestionIds: Set<string>): CommunicationFormResult[] => {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((result, index) => {
    const raw = result && typeof result === 'object' ? result as Record<string, unknown> : {}
    const conditions = (Array.isArray(raw.conditions) ? raw.conditions : []).slice(0, 10).map((condition) => {
      const entry = condition && typeof condition === 'object' ? condition as Record<string, unknown> : {}
      return {
        question_id: clean(entry.question_id),
        operator: clean(entry.operator) === 'includes' ? 'includes' as const : 'equals' as const,
        value: clean(entry.value).slice(0, 300),
      }
    }).filter((condition) => validQuestionIds.has(condition.question_id) && condition.value)
    return {
      id: clean(raw.id) || `result-${index + 1}`,
      title: clean(raw.title).slice(0, 160),
      description: clean(raw.description).slice(0, 1000),
      file_key: clean(raw.file_key),
      file_name: clean(raw.file_name).slice(0, 180),
      content_type: clean(raw.content_type),
      size_bytes: Number(raw.size_bytes || 0),
      conditions,
      is_default: Boolean(raw.is_default),
    }
  }).filter((result) => result.title && result.file_key && result.file_name && COMMUNICATION_FORM_CONTENT_TYPES.has(result.content_type) && Number.isFinite(result.size_bytes) && result.size_bytes > 0 && result.size_bytes <= COMMUNICATION_FORM_MAX_FILE_BYTES)
}

const conditionMatches = (condition: CommunicationFormCondition, answers: Record<string, unknown>) => {
  const answer = answers[condition.question_id]
  if (condition.operator === 'includes') return Array.isArray(answer) && answer.map(clean).includes(condition.value)
  return clean(answer) === condition.value
}

export const selectCommunicationFormResult = (results: CommunicationFormResult[], answers: Record<string, unknown>) =>
  results.find((result) => !result.is_default && result.conditions.length > 0 && result.conditions.every((condition) => conditionMatches(condition, answers)))
  || results.find((result) => result.is_default)
  || results[0]

export const validateCommunicationFormAnswers = (questions: CommunicationFormQuestion[], value: unknown) => {
  const rawAnswers = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const answers: Record<string, string | string[]> = {}
  for (const question of questions) {
    const raw = rawAnswers[question.id]
    if (question.type === 'multiple_choice') {
      const selected = Array.from(new Set((Array.isArray(raw) ? raw : []).map(clean).filter((answer) => question.options.includes(answer))))
      if (question.required && selected.length === 0) throw new Error(`Responde: ${question.prompt}`)
      answers[question.id] = selected
      continue
    }
    const answer = clean(raw).slice(0, 2000)
    if (question.required && !answer) throw new Error(`Responde: ${question.prompt}`)
    if (question.type === 'single_choice' && answer && !question.options.includes(answer)) throw new Error(`Respuesta inválida: ${question.prompt}`)
    answers[question.id] = answer
  }
  return answers
}

const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/
export const COMMUNICATION_FORM_MAX_SIGNATURE_LENGTH = 350_000

export const validateCommunicationFormSignature = (value: unknown) => {
  const signature = clean(value)
  if (!signature) throw new Error('Firma en pantalla antes de enviar el formulario.')
  if (signature.length < 200 || signature.length > COMMUNICATION_FORM_MAX_SIGNATURE_LENGTH || !SIGNATURE_DATA_URL_RE.test(signature)) {
    throw new Error('La firma no es válida. Límpiala y vuelve a firmar.')
  }
  return signature
}
