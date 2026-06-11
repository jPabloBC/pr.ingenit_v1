import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { normalizeText } from '@/lib/normalize'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })

    const timeZone = 'America/Santiago'
    const canonicalDiscipline = (v: any) => {
      const n = normalizeText(String(v || ''))
      if (!n) return ''
      if (['electricidad', 'electrico', 'electricos', 'electricas'].includes(n)) return 'electricidad'
      if (['caneria', 'canieria', 'piping', 'canerias', 'canierias'].includes(n)) return 'caneria'
      if (['instrumentacion', 'instrumentaciones'].includes(n)) return 'instrumentacion'
      if (['mecanica', 'mecanico', 'mecanicos', 'mecanicas'].includes(n)) return 'mecanica'
      if (['soldadura', 'soldador', 'soldadores'].includes(n)) return 'soldadura'
      return n
    }
    const sameDiscipline = (a: any, b: any) => {
      const ca = canonicalDiscipline(a)
      const cb = canonicalDiscipline(b)
      return !!ca && !!cb && ca === cb
    }
    const localDateKey = (dt: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(dt)
      const map: Record<string, string> = {}
      parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value })
      return `${map.year}-${map.month}-${map.day}`
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get('date')
    const datesOnly = searchParams.get('dates') === '1' || searchParams.get('dates') === 'true'
    const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : localDateKey(new Date())
    const role = String(session?.user?.role || '').toLowerCase()
    const isAdmin = ['admin', 'dev', 'hr_manager', 'supervisor'].includes(role)
    const userSpec = session?.user?.specialty ? normalizeText(String(session.user.specialty)) : ''

    const { data: crews, error: crewsErr } = await supabaseAdmin
      .from('pr_crews')
      .select('*')
      .eq('company_id', session.user.companyId)
    if (crewsErr) return NextResponse.json({ error: crewsErr.message }, { status: 500 })

    const filteredCrews = isAdmin
      ? (crews || [])
      : (crews || []).filter((c: any) => sameDiscipline(c?.specialty, userSpec))

    const crewIds = Array.from(new Set(filteredCrews.map((c: any) => String(c.id)).filter(Boolean)))
    if (crewIds.length === 0) return NextResponse.json(datesOnly ? { dates: [] } : [])

    if (datesOnly) {
      const { data: dateRows, error: dateErr } = await supabaseAdmin
        .from('pr_crew_activities')
        .select('work_date, created_at, crew_id, activity_id')
        .in('crew_id', crewIds)
        .order('created_at', { ascending: false })
      if (dateErr) return NextResponse.json({ error: dateErr.message }, { status: 500 })

      const rowsWithActivity = (dateRows || []).filter((r: any) => !!r?.activity_id)
      if (rowsWithActivity.length === 0) return NextResponse.json({ dates: [] })

      // For role user, keep only assignments whose program discipline matches the user discipline,
      // mirroring the final export filter to avoid selectable dates that later export empty.
      let allowedActivityIds: Set<string> | null = null
      if (!isAdmin) {
        if (!userSpec) return NextResponse.json({ dates: [] })
        const ids = Array.from(new Set(rowsWithActivity.map((r: any) => String(r.activity_id)).filter(Boolean)))
        if (ids.length === 0) return NextResponse.json({ dates: [] })
        const { data: actRows, error: actErr } = await supabaseAdmin
          .from('pr_program')
          .select('id, discipline')
          .eq('company_id', session.user.companyId)
          .in('id', ids)
        if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 })
        allowedActivityIds = new Set(
          (actRows || [])
            .filter((a: any) => sameDiscipline(a?.discipline, userSpec))
            .map((a: any) => String(a.id))
        )
      }

      const uniq = new Set<string>()
      ;(rowsWithActivity || []).forEach((r: any) => {
        const actId = String(r?.activity_id || '')
        if (!actId) return
        if (allowedActivityIds && !allowedActivityIds.has(actId)) return
        if (r?.work_date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.work_date))) {
          uniq.add(String(r.work_date))
          return
        }
        if (r?.created_at) uniq.add(localDateKey(new Date(r.created_at)))
      })

      // Fallback: also include crew work dates / creation dates so export controls stay available
      // for created crews even if activities are not yet assigned.
      ;(filteredCrews || []).forEach((c: any) => {
        const wd = c?.work_date ? String(c.work_date) : ''
        if (wd && /^\d{4}-\d{2}-\d{2}$/.test(wd)) {
          uniq.add(wd)
          return
        }
        if (c?.created_at) uniq.add(localDateKey(new Date(c.created_at)))
      })

      const dates = Array.from(uniq).sort((a, b) => (a < b ? 1 : -1))
      return NextResponse.json({ dates })
    }

    const fetchAssignments = async (withDisplayOrder: boolean, useDate: boolean) => {
      const cols = ['id', 'crew_id', 'activity_id', 'created_at']
      if (withDisplayOrder) cols.push('display_order')
      let q = supabaseAdmin
        .from('pr_crew_activities')
        .select(cols.join(', '))
        .in('crew_id', crewIds)
      q = useDate ? q.eq('work_date', targetDate) : q.is('work_date', null)
      return q
    }

    const fetchAssignmentsCompat = async (useDate: boolean) => {
      const first = await fetchAssignments(true, useDate)
      if (!first.error) return first
      return fetchAssignments(false, useDate)
    }

    const { data: assignedByDate, error: assignedErr } = await fetchAssignmentsCompat(true)
    if (assignedErr) return NextResponse.json({ error: assignedErr.message }, { status: 500 })

    const { data: assignedFallback, error: assignedFallbackErr } = await fetchAssignmentsCompat(false)
    if (assignedFallbackErr) return NextResponse.json({ error: assignedFallbackErr.message }, { status: 500 })

    const assignedFallbackLocalDate = (assignedFallback || []).filter((a: any) => {
      if (!a?.created_at) return false
      return localDateKey(new Date(a.created_at)) === targetDate
    })
    const assignedCombined = [...(assignedByDate || []), ...assignedFallbackLocalDate]
    const seen = new Set<string>()
    const assigned = assignedCombined
      .filter((a: any) => {
        const k = String(a?.id || `${a?.crew_id || ''}::${a?.activity_id || ''}::${a?.created_at || ''}`)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a: any, b: any) => {
        const ca = String(a?.crew_id || '')
        const cb = String(b?.crew_id || '')
        if (ca !== cb) return ca.localeCompare(cb)
        const ao = Number(a?.display_order)
        const bo = Number(b?.display_order)
        const aHas = Number.isFinite(ao)
        const bHas = Number.isFinite(bo)
        if (aHas && bHas && ao !== bo) return ao - bo
        if (aHas && !bHas) return -1
        if (!aHas && bHas) return 1
        return String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
      })
    const activityIds = Array.from(new Set((assigned || []).map((a: any) => String(a.activity_id)).filter(Boolean)))

    const { data: activities } = activityIds.length > 0
      ? await supabaseAdmin.from('pr_program').select('id, activity, area, discipline, unit, quantity, package, description').eq('company_id', session.user.companyId).in('id', activityIds)
      : { data: [] as any[] }

    let crewMembers: any[] = []
    if (crewIds.length > 0) {
      try {
        const sel = await supabaseAdmin
          .from('pr_crew_members')
          .select('crew_id, collaborator_id, role')
          .in('crew_id', crewIds)
        if (sel.error) throw sel.error
        crewMembers = sel.data || []
      } catch (e: any) {
        const msg = String(e?.message || e)
        const lacksRoleColumn = /column\s+\w*role\w*\s+does not exist/i.test(msg) || String(e?.code) === '42703'
        if (!lacksRoleColumn) {
          // If the table itself doesn't exist, allow export without members.
          const tableMissing = String(e?.code) === '42P01' || /relation\s+.*pr_crew_members.*does not exist/i.test(msg)
          if (!tableMissing) return NextResponse.json({ error: msg }, { status: 500 })
        }
        const sel2 = await supabaseAdmin
          .from('pr_crew_members')
          .select('crew_id, collaborator_id')
          .in('crew_id', crewIds)
        if (sel2.error) {
          const msg2 = String(sel2.error.message || sel2.error)
          const tableMissing2 = String((sel2.error as any)?.code) === '42P01' || /relation\s+.*pr_crew_members.*does not exist/i.test(msg2)
          if (!tableMissing2) return NextResponse.json({ error: msg2 }, { status: 500 })
          crewMembers = []
        } else {
          crewMembers = (sel2.data || []).map((r: any) => ({ ...r, role: null }))
        }
      }
    }

    const activityMap = new Map((activities || []).map((a: any) => [String(a.id), a]))
    const crewMap = new Map((filteredCrews || []).map((c: any) => [String(c.id), c]))

    const membersByCrew = new Map<string, { names: string; positions: string; docs: string; supervisors: string; foremen: string; members: string; list: { name: string; position: string; doc: string; rank: number }[] }>()
    const collectIds = new Set<string>()
    ;(crewMembers || []).forEach((m: any) => {
      if (m && m.collaborator_id) collectIds.add(String(m.collaborator_id))
    })
    // include legacy crew fields when pr_crew_members is empty/missing
    ;(crews || []).forEach((c: any) => {
      const sup = Array.isArray(c.supervisors) ? c.supervisors : (c.supervisor ? [c.supervisor] : [])
      const frm = Array.isArray(c.foremen) ? c.foremen : (c.foreman ? [c.foreman] : [])
      const mem = Array.isArray(c.members) ? c.members : (c.member ? [c.member] : [])
      ;[...sup, ...frm, ...mem].forEach((id: any) => { if (id) collectIds.add(String(id)) })
    })
    const collaboratorIds = Array.from(collectIds)
    let collaborators: any[] = []
    if (collaboratorIds.length > 0) {
      const { data: collabs } = await supabaseAdmin
        .from('pr_collaborators')
        .select('id, first_name, last_name, position, document')
        .in('id', collaboratorIds)
      collaborators = collabs || []
    }
    const collabMap = new Map((collaborators || []).map((c: any) => [String(c.id), c]))
    const classifyRole = (posRaw: any) => {
      const p = String(posRaw || '').toLowerCase()
      if (p.includes('supervisor') || p.includes('jefe') || p.includes('coordinador')) return 'supervisor'
      if (p.includes('capataz') || p.includes('encargado') || p.includes('foreman')) return 'foreman'
      return 'member'
    }
    const rankPosition = (posRaw: any) => {
      const p = String(posRaw || '').toLowerCase()
      if (p.includes('supervisor') || p.includes('jefe') || p.includes('coordinador')) return 1
      if (p.includes('capataz') || p.includes('encargado') || p.includes('foreman')) return 2
      if (p.includes('maestro mayor')) return 3
      if (p.includes('maestro primera') || p.includes('maestro 1ra') || p.includes('primera')) return 4
      if (p.includes('maestro segunda') || p.includes('maestro 2da') || p.includes('segunda')) return 5
      if (p.includes('ayudante')) return 6
      return 99
    }
    const roleRank = (roleRaw: any, posRaw: any) => {
      const r = String(roleRaw || '').toLowerCase()
      if (r === 'supervisor') return 1
      if (r === 'foreman') return 2
      return rankPosition(posRaw)
    }
    const pushMember = (crewId: string, name: string, pos: string, doc: string, rank: number, role: string) => {
      const prev = membersByCrew.get(crewId) || { names: '', positions: '', docs: '', supervisors: '', foremen: '', members: '', list: [] as any[] }
      const formatted = doc ? `${name} - ${pos} - ${doc}` : (pos ? `${name} - ${pos}` : name)
      const append = (cur: string, val: string) => (cur ? `${cur}; ${val}` : val)
      membersByCrew.set(crewId, {
        names: prev.names ? `${prev.names}; ${name}` : name,
        positions: prev.positions ? `${prev.positions}; ${pos}` : pos,
        docs: prev.docs ? `${prev.docs}; ${doc}` : doc,
        supervisors: role === 'supervisor' ? append(prev.supervisors, formatted) : prev.supervisors,
        foremen: role === 'foreman' ? append(prev.foremen, formatted) : prev.foremen,
        members: role === 'member' ? append(prev.members, formatted) : prev.members,
        list: [...prev.list, { name, position: pos, doc, rank }]
      })
    }

    for (const m of (crewMembers || []) as any[]) {
      const crewId = String(m.crew_id)
      const c = collabMap.get(String(m.collaborator_id)) || null
      if (!c) continue
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim()
      const pos = c.position ? String(c.position) : ''
      const doc = c.document || ''
      const role = m.role ? String(m.role).toLowerCase() : classifyRole(pos)
      const rank = roleRank(role, pos)
      pushMember(crewId, name, pos, doc, rank, role)
    }

    // Legacy fallback: populate role buckets if still empty
    for (const c of (crews || []) as any[]) {
      const crewId = String(c.id)
      const sup = Array.isArray(c.supervisors) ? c.supervisors : (c.supervisor ? [c.supervisor] : [])
      const frm = Array.isArray(c.foremen) ? c.foremen : (c.foreman ? [c.foreman] : [])
      const mem = Array.isArray(c.members) ? c.members : (c.member ? [c.member] : [])
      const prev = membersByCrew.get(crewId) || { names: '', positions: '', docs: '', supervisors: '', foremen: '', members: '', list: [] as any[] }
      const pushIds = (ids: any[], bucket: 'supervisors' | 'foremen' | 'members') => {
        for (const id of ids || []) {
          const cdata = collabMap.get(String(id)) || null
          if (!cdata) continue
          const name = `${cdata.first_name || ''} ${cdata.last_name || ''}`.trim()
          const pos = cdata.position ? String(cdata.position) : ''
          const doc = cdata.document || ''
          const role = bucket === 'supervisors' ? 'supervisor' : bucket === 'foremen' ? 'foreman' : 'member'
          const rank = roleRank(role, pos)
          pushMember(crewId, name, pos, doc, rank, role)
        }
      }
      if (!prev.supervisors) pushIds(sup, 'supervisors')
      if (!prev.foremen) pushIds(frm, 'foremen')
      if (!prev.members) pushIds(mem, 'members')
    }

    // Build ordered strings by hierarchy for export
    for (const [crewId, data] of membersByCrew.entries()) {
      const ordered = [...(data.list || [])].sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        return a.name.localeCompare(b.name, 'es')
      })
      const names = ordered.map(m => m.name)
      const positions = ordered.map(m => m.position)
      const docs = ordered.map(m => m.doc)
      membersByCrew.set(crewId, {
        ...data,
        ordered_list: ordered,
        ordered: {
          names: names.join('; '),
          positions: positions.join('; '),
          docs: docs.join('; ')
        }
      } as any)
    }

    const assignedFiltered = isAdmin
      ? (assigned || []).filter((a: any) => crewIds.includes(String(a.crew_id)))
      : (assigned || []).filter((a: any) => {
          const act = activityMap.get(String(a.activity_id)) || {}
          return sameDiscipline(act.discipline, userSpec)
        })

    const rows = (assignedFiltered || []).map((a: any) => {
      const act = activityMap.get(String(a.activity_id)) || {}
      const crew = crewMap.get(String(a.crew_id)) || {}
      return {
        crew_id: a.crew_id,
        crew_name: crew.name || '',
        crew_specialty: crew.specialty || '',
        crew_members: membersByCrew.get(String(a.crew_id)) || { names: '', positions: '', docs: '', supervisors: '', foremen: '', members: '', ordered: { names: '', positions: '', docs: '' } },
        activity_id: a.activity_id,
        activity: act.activity || '',
        area: act.area || '',
        discipline: act.discipline || '',
        quantity: act.quantity ?? '',
        unit: act.unit || '',
        package: act.package || '',
        description: act.description || '',
        assigned_at: a.created_at,
      }
    })

    const assignedCrewSet = new Set((assignedFiltered || []).map((a: any) => String(a.crew_id)))
    const crewBelongsToDate = (c: any) => {
      const wd = c?.work_date ? String(c.work_date) : ''
      if (wd && /^\d{4}-\d{2}-\d{2}$/.test(wd)) return wd === targetDate
      if (c?.created_at) return localDateKey(new Date(c.created_at)) === targetDate
      return false
    }
    for (const c of (filteredCrews || []) as any[]) {
      if (!crewBelongsToDate(c)) continue
      if (!assignedCrewSet.has(String(c.id))) {
        rows.push({
          crew_id: c.id,
          crew_name: c.name || '',
          crew_specialty: c.specialty || '',
          crew_members: membersByCrew.get(String(c.id)) || { names: '', positions: '', docs: '', supervisors: '', foremen: '', members: '', ordered: { names: '', positions: '', docs: '' } },
          activity_id: '',
          activity: '',
          area: '',
          discipline: '',
          quantity: '',
          unit: '',
          package: '',
          description: '',
          assigned_at: '',
        })
      }
    }

    if (!isAdmin) {
      if (!userSpec) return NextResponse.json([], { status: 200 })
      const filtered = rows.filter((r: any) => {
        if (sameDiscipline(r.discipline, userSpec)) return true
        if (!r.discipline && sameDiscipline(r.crew_specialty, userSpec)) return true
        return false
      })
      return NextResponse.json(filtered)
    }

    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
