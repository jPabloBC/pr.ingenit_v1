export const CURRENT_CALCULATION_VERSION = 2
export const LEGACY_CALCULATION_VERSION = 1

export const CURRENT_PERSON_WORKDAY_HOURS = 11
export const CURRENT_MACHINE_WORKDAY_HOURS = 11
export const DEFAULT_LEGACY_PERSON_WORKDAY_HOURS = 10
export const DEFAULT_LEGACY_MACHINE_WORKDAY_HOURS = 10

export const CURRENT_HALF_DAY_HOURS = 5.5
export const DEFAULT_LEGACY_HALF_DAY_HOURS = 5

export const MAX_PERSON_HOURS_WITH_OVERTIME = 15
export const MAX_MACHINE_HOURS_WITH_OVERTIME = 15

export type CalculationVersion = typeof LEGACY_CALCULATION_VERSION | typeof CURRENT_CALCULATION_VERSION

export type WorkdayCalculationMetadata = {
  calculationVersion: CalculationVersion
  personWorkdayHours: number
  machineWorkdayHours: number
  halfDayHours: number
  maxPersonHoursWithOvertime: number
  maxMachineHoursWithOvertime: number
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const parseJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

const toPlainObject = (value: unknown): Record<string, unknown> | null => {
  if (isPlainObject(value)) return value
  const parsed = parseJsonObject(value)
  if (parsed) return parsed
  return null
}

const readNumber = (value: unknown): number | null => {
  if (value == null || String(value).trim() === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const readCalculationVersionValue = (value: unknown): CalculationVersion | null => {
  const parsed = readNumber(value)
  if (parsed === CURRENT_CALCULATION_VERSION) return CURRENT_CALCULATION_VERSION
  if (parsed === LEGACY_CALCULATION_VERSION) return LEGACY_CALCULATION_VERSION
  return null
}

const sourceCandidates = (source: unknown): Record<string, unknown>[] => {
  const base = toPlainObject(source)
  if (!base) return []

  const candidates = [base]
  ;['v2_form_snapshot', 'v2_runtime_snapshot', 'notes'].forEach((key) => {
    const nested = toPlainObject(base[key])
    if (nested) candidates.push(nested)
  })

  return candidates
}

const readFirstNumber = (source: unknown, keys: string[]): number | null => {
  for (const candidate of sourceCandidates(source)) {
    for (const key of keys) {
      const value = readNumber(candidate[key])
      if (value != null) return value
    }
  }
  return null
}

export const getCurrentWorkdayMetadata = (): WorkdayCalculationMetadata => ({
  calculationVersion: CURRENT_CALCULATION_VERSION,
  personWorkdayHours: CURRENT_PERSON_WORKDAY_HOURS,
  machineWorkdayHours: CURRENT_MACHINE_WORKDAY_HOURS,
  halfDayHours: CURRENT_HALF_DAY_HOURS,
  maxPersonHoursWithOvertime: MAX_PERSON_HOURS_WITH_OVERTIME,
  maxMachineHoursWithOvertime: MAX_MACHINE_HOURS_WITH_OVERTIME,
})

export const resolveCalculationVersion = (source: unknown): CalculationVersion => {
  for (const candidate of sourceCandidates(source)) {
    const version = readCalculationVersionValue(candidate.calculationVersion)
    if (version != null) return version
  }
  return LEGACY_CALCULATION_VERSION
}

export const resolvePersonWorkdayHours = (source: unknown): number => {
  const explicit = readFirstNumber(source, ['personWorkdayHours'])
  if (explicit != null) return explicit

  const general = readFirstNumber(source, ['workdayHours'])
  if (general != null) return general

  return resolveCalculationVersion(source) === CURRENT_CALCULATION_VERSION
    ? CURRENT_PERSON_WORKDAY_HOURS
    : DEFAULT_LEGACY_PERSON_WORKDAY_HOURS
}

export const resolveMachineWorkdayHours = (source: unknown): number => {
  const explicit = readFirstNumber(source, ['machineWorkdayHours'])
  if (explicit != null) return explicit

  const general = readFirstNumber(source, ['workdayHours'])
  if (general != null) return general

  return resolveCalculationVersion(source) === CURRENT_CALCULATION_VERSION
    ? CURRENT_MACHINE_WORKDAY_HOURS
    : DEFAULT_LEGACY_MACHINE_WORKDAY_HOURS
}

export const resolveHalfDayHours = (source: unknown): number => {
  const explicit = readFirstNumber(source, ['halfDayHours'])
  if (explicit != null) return explicit

  return resolveCalculationVersion(source) === CURRENT_CALCULATION_VERSION
    ? CURRENT_HALF_DAY_HOURS
    : DEFAULT_LEGACY_HALF_DAY_HOURS
}

export const resolvePersonDotationFromHours = (hours: unknown, source: unknown): number => {
  const parsedHours = readNumber(hours) || 0
  const workdayHours = resolvePersonWorkdayHours(source)
  return workdayHours > 0 ? parsedHours / workdayHours : 0
}

export const resolveMachineDotationFromHours = (hours: unknown, source: unknown): number => {
  const parsedHours = readNumber(hours) || 0
  const workdayHours = resolveMachineWorkdayHours(source)
  return workdayHours > 0 ? parsedHours / workdayHours : 0
}

export const isLegacyCalculation = (source: unknown): boolean =>
  resolveCalculationVersion(source) === LEGACY_CALCULATION_VERSION

export const isCurrentCalculation = (source: unknown): boolean =>
  resolveCalculationVersion(source) === CURRENT_CALCULATION_VERSION
