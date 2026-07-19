/**
 * Fields that the profile-only Excel import can safely update.
 *
 * `document` is intentionally excluded: it is the stable identifier used to
 * find the collaborator and must never be changed by this import mode.
 * Keep this list shared by the UI and API so a selectable field cannot drift
 * away from what the server actually accepts.
 */
export const COLLABORATOR_PROFILE_IMPORT_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'address',
  'position',
  'specialty',
  'worker_type',
  'contract',
  'shift_pattern',
  'condition',
  'exception_condition',
  'is_active',
  'salary',
  'birth_date',
  'hire_date',
  'emergency_contact',
  'upper_clothing_size',
  'lower_clothing_size',
  'shoe_size',
  'gender',
  'photo_url',
  'signature_url',
  'epp_details',
] as const

export type CollaboratorProfileImportField = (typeof COLLABORATOR_PROFILE_IMPORT_FIELDS)[number]
