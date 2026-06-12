import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const normalizeSpecialties = (val: any): string[] => {
  if (!val) return []
  if (Array.isArray(val)) return val.map(String).filter(Boolean)
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {}
  }
  return []
}

export async function GET(_req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) {
      return NextResponse.json({ allowByUser: false, allowedSpecialties: [] }, { status: 200 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id

    let allowByUser = false
    let allowedSpecialties: string[] = []

    if (userId) {
      try {
        const { data, error } = await supabaseAdmin
          .from('pr_users')
          .select('allow_late_crew_creation')
          .eq('id', userId)
          .maybeSingle()
        if (!error && data) {
          allowByUser = !!(data as any).allow_late_crew_creation
        }
      } catch {}
    }

    if (companyId) {
      try {
        const { data, error } = await supabaseAdmin
          .from('pr_companies_meta')
          .select('late_crew_creation_specialties')
          .eq('company_id', companyId)
          .maybeSingle()
        if (!error && data) {
          allowedSpecialties = normalizeSpecialties((data as any).late_crew_creation_specialties)
        }
      } catch {}
    }

    return NextResponse.json({ allowByUser, allowedSpecialties }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ allowByUser: false, allowedSpecialties: [] }, { status: 200 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = String(session?.user?.role || '')
    if (role !== 'dev' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const allowedSpecialties = Array.isArray(body?.allowedSpecialties) ? body.allowedSpecialties : []
    const allowedUserIds = Array.isArray(body?.allowedUserIds) ? body.allowedUserIds.map(String) : []
    const companyId = session.user.companyId

    const { error: metaErr } = await supabaseAdmin
      .from('pr_companies_meta')
      .upsert({ company_id: companyId, late_crew_creation_specialties: allowedSpecialties }, { onConflict: 'company_id' })
    if (metaErr) {
      return NextResponse.json({ error: metaErr.message }, { status: 500 })
    }

    if (allowedUserIds.length === 0) {
      const { error: clearErr } = await supabaseAdmin
        .from('pr_users')
        .update({ allow_late_crew_creation: false })
        .eq('company_id', companyId)
      if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 })
    } else {
      const inList = `(${allowedUserIds.map((id: string) => `"${id}"`).join(',')})`
      const { error: allowErr } = await supabaseAdmin
        .from('pr_users')
        .update({ allow_late_crew_creation: true })
        .eq('company_id', companyId)
        .in('id', allowedUserIds)
      if (allowErr) return NextResponse.json({ error: allowErr.message }, { status: 500 })

      const { error: denyErr } = await supabaseAdmin
        .from('pr_users')
        .update({ allow_late_crew_creation: false })
        .eq('company_id', companyId)
        .not('id', 'in', inList)
      if (denyErr) return NextResponse.json({ error: denyErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
