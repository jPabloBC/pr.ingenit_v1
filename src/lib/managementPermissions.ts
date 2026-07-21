export const MANAGEMENT_PERMISSION = 'management'

export const MANAGEMENT_TAB_DEFINITIONS = [
  { value: 'hh', permissionKey: 'management.hh', label: 'HH' },
  { value: 'hh-history', permissionKey: 'management.hh-history', label: 'HH histórico' },
  { value: 'crew-personnel', permissionKey: 'management.crew-personnel', label: 'Personal / Cuadrillas' },
  { value: 'activities', permissionKey: 'management.activities', label: 'Actividades' },
  { value: 'interferences', permissionKey: 'management.interferences', label: 'Interferencias' },
  { value: 'equipment', permissionKey: 'management.equipment', label: 'Maquinaria / Equipos' },
  { value: 'report-fronts', permissionKey: 'management.report-fronts', label: 'Frentes / UDR' },
  { value: 'transmittal', permissionKey: 'management.transmittal', label: 'Transmittal' },
  { value: 'photo-report', permissionKey: 'management.photo-report', label: 'Informe Fotográfico' },
] as const

export type ManagementTab = (typeof MANAGEMENT_TAB_DEFINITIONS)[number]['value']

const MANAGEMENT_TAB_VALUES = new Set<string>(MANAGEMENT_TAB_DEFINITIONS.map((tab) => tab.value))
const MANAGEMENT_TAB_PERMISSION_KEYS = new Set<string>(MANAGEMENT_TAB_DEFINITIONS.map((tab) => tab.permissionKey))

export const isManagementTab = (value: string): value is ManagementTab => MANAGEMENT_TAB_VALUES.has(value)

export const hasManagementModulePermission = (permissions: readonly string[]) => (
  permissions.includes('*')
  || permissions.includes(MANAGEMENT_PERMISSION)
  || permissions.some((permission) => MANAGEMENT_TAB_PERMISSION_KEYS.has(permission))
)

export const resolveAllowedManagementTabs = (permissions: readonly string[], role: string): ManagementTab[] => {
  const normalizedRole = String(role || '').trim().toLowerCase()
  const fullAccess = normalizedRole === 'admin' || normalizedRole === 'dev' || permissions.includes('*')
  if (fullAccess || permissions.includes(MANAGEMENT_PERMISSION)) {
    return MANAGEMENT_TAB_DEFINITIONS.map((tab) => tab.value)
  }

  return MANAGEMENT_TAB_DEFINITIONS
    .filter((tab) => permissions.includes(tab.permissionKey))
    .map((tab) => tab.value)
}
