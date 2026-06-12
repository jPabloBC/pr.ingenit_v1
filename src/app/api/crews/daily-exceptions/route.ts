import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const isValidDateKey = (value: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const companyId = String(session?.user?.companyId || '').trim()
    if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const date = String(req.nextUrl.searchParams.get('date') || '').trim()
    if (!isValidDateKey(date)) {
      return NextResponse.json({ error: 'Fecha inválida. Use YYYY-MM-DD.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('pr_crew_daily_exceptions')
      .select('collaborator_id,note,reason_type')
      .eq('company_id', companyId)
      .eq('work_date', date)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: crews, error: crewsErr } = await supabaseAdmin
      .from('pr_crews')
      .select('id')
      .eq('company_id', companyId)
      .eq('work_date', date)
    if (crewsErr) return NextResponse.json({ error: crewsErr.message }, { status: 500 })

    const crewIds = (crews || []).map((crew: any) => String(crew?.id || '')).filter(Boolean)
    let assignedCollaboratorIds: string[] = []
    if (crewIds.length > 0) {
      const { data: members, error: membersErr } = await supabaseAdmin
        .from('pr_crew_members')
        .select('collaborator_id')
        .in('crew_id', crewIds)
      if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 })
      assignedCollaboratorIds = Array.from(new Set((members || []).map((m: any) => String(m?.collaborator_id || '')).filter(Boolean)))
    }

    return NextResponse.json({
      rows: data || [],
      assigned_collaborator_ids: assignedCollaboratorIds
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err || 'Unexpected error') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    const companyId = String(session?.user?.companyId || '').trim()
    const userId = String(session?.user?.id || '').trim() || null
    if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden: read-only role' }, { status: 403 })

    const body = await req.json()
    const workDate = String(body?.work_date || '').trim()
    if (!isValidDateKey(workDate)) {
      return NextResponse.json({ error: 'Fecha inválida. Use YYYY-MM-DD.' }, { status: 400 })
    }

    const entriesRaw = Array.isArray(body?.entries) ? body.entries : []
    const scopeIdsRaw = Array.isArray(body?.scope_collaborator_ids) ? body.scope_collaborator_ids : []
    const scopeIds = Array.from(new Set(scopeIdsRaw.map((x: any) => String(x || '').trim()).filter(Boolean)))

    const byCollab = new Map<string, { note: string | null; reason_type: string | null }>()
    entriesRaw.forEach((e: any) => {
      const collaboratorId = String(e?.collaborator_id || '').trim()
      if (!collaboratorId) return
      const note = String(e?.note || '').trim()
      const reasonType = String(e?.reason_type || '').trim()
      byCollab.set(collaboratorId, {
        note: note.length > 0 ? note : null,
        reason_type: reasonType.length > 0 ? reasonType : null
      })
    })

    const toPersist = Array.from(byCollab.entries())
      .filter(([, v]) => !!(v.note || v.reason_type))
      .map(([collaboratorId, v]) => ({
        company_id: companyId,
        work_date: workDate,
        collaborator_id: collaboratorId,
        note: v.note,
        reason_type: v.reason_type,
        created_by: userId
      }))

    if (toPersist.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from('pr_crew_daily_exceptions')
        .upsert(toPersist, { onConflict: 'company_id,work_date,collaborator_id' })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    if (scopeIds.length > 0) {
      const keepIds = new Set(toPersist.map((x) => String(x.collaborator_id)))
      const idsToDelete = scopeIds.filter((id) => !keepIds.has(String(id)))
      if (idsToDelete.length > 0) {
        const { error: delErr } = await supabaseAdmin
          .from('pr_crew_daily_exceptions')
          .delete()
          .eq('company_id', companyId)
          .eq('work_date', workDate)
          .in('collaborator_id', idsToDelete)
        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
    }

    const { data, error } = await supabaseAdmin
      .from('pr_crew_daily_exceptions')
      .select('collaborator_id,note,reason_type')
      .eq('company_id', companyId)
      .eq('work_date', workDate)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, rows: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err || 'Unexpected error') }, { status: 500 })
  }
}
