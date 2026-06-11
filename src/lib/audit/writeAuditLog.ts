type AuditAction = 'create' | 'update' | 'delete' | 'view' | 'export' | 'download'

type WriteAuditLogParams = {
  supabaseAdmin: any
  companyId: string
  projectId?: string | null
  actorUserId?: string | null
  actorEmail?: string | null
  actorRole?: string | null
  action: AuditAction
  resourceType: string
  resourceId?: string | null
  beforeData?: any
  afterData?: any
  metadata?: Record<string, any> | null
}

const normalizeOptional = (value: unknown) => {
  const text = String(value || '').trim()
  return text || null
}

export async function writeAuditLog(params: WriteAuditLogParams) {
  try {
    const { error } = await params.supabaseAdmin
      .from('platform_audit_logs')
      .insert({
        company_id: params.companyId,
        project_id: normalizeOptional(params.projectId),
        actor_user_id: normalizeOptional(params.actorUserId),
        actor_email: normalizeOptional(params.actorEmail),
        actor_role: normalizeOptional(params.actorRole),
        action: params.action,
        resource_type: params.resourceType,
        resource_id: normalizeOptional(params.resourceId),
        before_data: params.beforeData ?? null,
        after_data: params.afterData ?? null,
        metadata: params.metadata ?? null
      })

    if (error) {
      console.error('[audit] writeAuditLog failed', {
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        error
      })
    }
  } catch (err) {
    console.error('[audit] writeAuditLog exception', {
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      error: err
    })
  }
}
