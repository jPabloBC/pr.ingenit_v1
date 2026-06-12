import { NextResponse } from 'next/server'

type AssertCanMutateResourceParams = {
  session: any
  row: any
  resourceType?: string
}

const forbidden = (message: string) => NextResponse.json({ error: message }, { status: 403 })

export function assertCanMutateResource(params: AssertCanMutateResourceParams) {
  const role = String(params.session?.user?.role || '').toLowerCase()
  const actorUserId = String(params.session?.user?.id || '').trim()
  const createdBy = String(params.row?.created_by || '').trim()
  const resourceType = params.resourceType || 'resource'

  if (role === 'admin' || role === 'dev') return null
  if (role === 'viewer') return forbidden(`Forbidden: viewer no puede modificar ${resourceType}`)
  if (role !== 'user') return forbidden(`Forbidden: rol no autorizado para modificar ${resourceType}`)
  if (!actorUserId || !createdBy || createdBy !== actorUserId) {
    return forbidden(`Forbidden: solo el creador puede modificar ${resourceType}`)
  }
  return null
}
