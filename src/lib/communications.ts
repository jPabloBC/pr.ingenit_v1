import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveCurrentActor, type CurrentActor } from '@/lib/currentActor'

export const getCommunicationsActor = async () => {
  const session = (await getServerSession(authOptions as any)) as any
  if (!session?.user) return { session: null, actor: null as CurrentActor | null, allowed: false }

  const actor = await resolveCurrentActor(session)
  const role = String(actor?.role || session?.user?.role || '').trim().toLowerCase()
  const allowed = role === 'admin'
  return { session, actor, allowed }
}

export const canEditCommunications = (actor: CurrentActor | null) =>
  Boolean(actor && actor.role !== 'viewer')
