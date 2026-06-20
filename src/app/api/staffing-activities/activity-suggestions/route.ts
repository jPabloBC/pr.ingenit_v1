import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveCurrentActor } from '@/lib/currentActor'

export const dynamic = 'force-dynamic'

const clean = (value: unknown) => String(value || '').trim()

const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status })

const sessionProjectId = (session: any) =>
  clean(
    session?.user?.projectId ||
    session?.user?.project_id ||
    session?.projectId ||
    session?.project_id
  )

const tokenProjectId = (token: any) =>
  clean(token?.projectId || token?.project_id)

const uniqueSuggestions = (rows: any[]) => {
  const seen = new Set<string>()
  const out: string[] = []
  ;(rows || []).forEach((row) => {
    const activity = clean(row?.activity)
    const key = activity.toLocaleLowerCase('es')
    if (!activity || seen.has(key)) return
    seen.add(key)
    out.push(activity)
  })
  return out
}

const isMissingRelationError = (error: any) => {
  const message = clean(error?.message).toLowerCase()
  return error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('could not find')
}

const fetchSuggestions = async (params: {
  table: string
  companyId: string
  projectId: string
  query: string
  includeProject: boolean
}) => {
  let request = supabaseAdmin
    .from(params.table)
    .select('activity, created_at')
    .eq('company_id', params.companyId)
    .not('activity', 'is', null)
    .ilike('activity', `%${params.query}%`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (params.projectId && params.includeProject) request = request.eq('project_id', params.projectId)

  return request
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return jsonError('Unauthorized', 401)

    const actor = await resolveCurrentActor(session)
    const companyId = clean(actor?.companyId || session?.user?.companyId)
    if (!companyId) return jsonError('Missing company_id', 400)

    const q = clean(req.nextUrl.searchParams.get('q'))
    if (q.length < 2) return NextResponse.json({ suggestions: [] })

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as any
    const projectId = clean(actor?.projectId || sessionProjectId(session) || tokenProjectId(token))

    let { data, error } = await fetchSuggestions({
      table: 'pr_field_activity_logs',
      companyId,
      projectId,
      query: q,
      includeProject: true,
    })

    if (error && isMissingRelationError(error)) {
      ;({ data, error } = await fetchSuggestions({
        table: 'pr_field_staffing_activities',
        companyId,
        projectId,
        query: q,
        includeProject: true,
      }))
    }

    if (error && projectId && isMissingRelationError(error)) {
      ;({ data, error } = await fetchSuggestions({
        table: 'pr_field_staffing_activities',
        companyId,
        projectId: '',
        query: q,
        includeProject: false,
      }))
    }

    if (error) return jsonError(error.message, 500)

    return NextResponse.json({ suggestions: uniqueSuggestions(data || []).slice(0, 20) })
  } catch (err) {
    console.error('Error GET /api/staffing-activities/activity-suggestions', err)
    return jsonError('Unexpected server error', 500)
  }
}
