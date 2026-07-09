import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import { cleanPostgrestSearch } from '@/lib/querySafety'

const normalizeTextKey = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const toCanonicalUnit = (value: any): string | null => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const k = raw.toLowerCase().replace(/\s+/g, '')
  if (['ml', 'mℓ'].includes(k)) return 'ml'
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(k)) return 'L'
  if (['gal', 'gln', 'gl', 'galon', 'galones'].includes(k)) return 'gal'
  if (['mm'].includes(k)) return 'mm'
  if (['cm'].includes(k)) return 'cm'
  if (['m', 'mt', 'mts', 'metro', 'metros'].includes(k)) return 'm'
  if (['km', 'kms', 'kilometro', 'kilometros'].includes(k)) return 'km'
  if (['m2', 'mt2', 'mts2', 'm^2'].includes(k)) return 'm2'
  if (['m3', 'mt3', 'mts3', 'm^3'].includes(k)) return 'm3'
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(k)) return 'g'
  if (['kg', 'kgr', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(k)) return 'kg'
  if (['ton', 'tn', 't', 'tonelada', 'toneladas'].includes(k)) return 't'
  if (['u', 'un', 'und', 'unidad', 'unidades', 'ea'].includes(k)) return 'un'
  return raw
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const q = cleanPostgrestSearch(req.nextUrl.searchParams.get('q') || '')
    const limitRaw = req.nextUrl.searchParams.get('limit')
    const limitParam = limitRaw ? parseInt(limitRaw, 10) : NaN
    const disciplineParam = (req.nextUrl.searchParams.get('discipline') || '').trim()
    const normalizeKey = (val: string) =>
      val
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
    const excludeCrewCreated = ['1', 'true', 'yes'].includes((req.nextUrl.searchParams.get('exclude_crew_created') || '').toLowerCase())
    const includeCrewCreated = ['1', 'true', 'yes'].includes((req.nextUrl.searchParams.get('include_crew_created') || '').toLowerCase())
    const crewCreatedOnly = req.nextUrl.searchParams.get('source') === 'crews' ||
      ['1', 'true', 'yes'].includes((req.nextUrl.searchParams.get('crew_created') || '').toLowerCase())
    const shouldExcludeCrewCreated = excludeCrewCreated && !includeCrewCreated

    const buildQuery = (useOriginFilter: boolean) => {
      let query = supabaseAdmin
        .from('pr_program')
        .select(`
          id,
          item_id,
          sub_id,
          activity,
          description,
          area,
          discipline,
          unit,
          quantity,
          package,
          activity_origin,
          created_at
        `)
        .eq('company_id', session.user.companyId)
        .order('created_at', { ascending: false })

      if (useOriginFilter) {
        // Excluir solo actividades creadas en cuadrilla, pero mantener legacy rows
        // donde activity_origin es NULL.
        query = query.or('activity_origin.is.null,activity_origin.neq.crew_created')
      }

      if (crewCreatedOnly) {
        query = query.eq('activity_origin', 'crew_created')
      }

      if (q) {
        const like = `%${q}%`
        query = query.or(`item_id.ilike.${like},activity.ilike.${like},description.ilike.${like},area.ilike.${like},tree_path.ilike.${like},tree_level_1.ilike.${like},tree_level_2.ilike.${like},tree_level_3.ilike.${like},tree_level_4.ilike.${like},tree_level_5.ilike.${like}`)
      }

      if (disciplineParam) {
        const key = normalizeKey(disciplineParam)
        if (['caneria', 'canieria', 'piping', 'caneria '].includes(key)) {
          query = query.or('discipline.ilike.%caneria%,discipline.ilike.%canieria%,discipline.ilike.%piping%')
        } else {
          query = query.ilike('discipline', disciplineParam)
        }
      }

      if (Number.isFinite(limitParam) && limitParam > 0) {
        query = query.limit(limitParam)
      }

      return query
    }

    let { data, error } = await buildQuery(shouldExcludeCrewCreated)
    if (error && shouldExcludeCrewCreated && String(error.message || '').toLowerCase().includes('activity_origin')) {
      const retry = await buildQuery(false)
      data = retry.data
      error = retry.error
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const activity = String(body?.activity || '').trim()
    const area = body?.area == null ? null : String(body.area).trim() || null
    const discipline = body?.discipline == null ? null : String(body.discipline).trim() || null
    const unit = toCanonicalUnit(body?.unit)
    const crewsSource = req.nextUrl.searchParams.get('source') === 'crews'

    if (!activity) {
      return NextResponse.json({ error: 'Actividad es obligatoria' }, { status: 400 })
    }

    let quantity: number | null = null
    if (!(body?.quantity === undefined || body?.quantity === null || String(body.quantity).trim() === '')) {
      const raw = String(body.quantity).replace(',', '.').trim()
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: 'Cantidad inválida. Debe ser numérica.' }, { status: 400 })
      }
      if (parsed < 0) {
        return NextResponse.json({ error: 'Cantidad inválida. Debe ser mayor o igual a 0.' }, { status: 400 })
      }
      quantity = parsed
    }

    // Anti-dup: avoid creating the same activity/area/discipline within company.
    let duplicateQuery = supabaseAdmin
      .from('pr_program')
      .select('id, activity, area, discipline')
      .eq('company_id', session.user.companyId)
      .ilike('activity', activity)
      .limit(100)

    if (crewsSource) duplicateQuery = duplicateQuery.eq('activity_origin', 'crew_created')

    const { data: maybeDupRows, error: dupErr } = await duplicateQuery
    if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 500 })
    const targetKey = `${normalizeTextKey(activity)}|${normalizeTextKey(area)}|${normalizeTextKey(discipline)}`
    const dup = (maybeDupRows || []).find((r: any) =>
      `${normalizeTextKey(r?.activity)}|${normalizeTextKey(r?.area)}|${normalizeTextKey(r?.discipline)}` === targetKey
    )
    if (dup) {
      return NextResponse.json({ error: 'Actividad duplicada para la misma área y disciplina', existing: dup }, { status: 409 })
    }

    const requestedOrigin = String(body?.activity_origin || body?.origin || '').trim().toLowerCase()
    const activityOrigin = crewsSource || requestedOrigin === 'crew_created' ? 'crew_created' : 'program'

    const payload: any = {
      company_id: session.user.companyId,
      item_id: body.item_id || null,
      sub_id: body.sub_id || null,
      area,
      activity,
      package: body.package || null,
      discipline,
      description: body.description || null,
      tree_level_1: body.tree_level_1 || null,
      tree_level_2: body.tree_level_2 || null,
      tree_level_3: body.tree_level_3 || null,
      tree_level_4: body.tree_level_4 || null,
      tree_level_5: body.tree_level_5 || null,
      tree_path: body.tree_path || null,
      unit,
      quantity,
      observations: body.observations || null,
      activity_origin: activityOrigin,
    }

    let { data, error } = await supabaseAdmin
      .from('pr_program')
      .insert(payload)
      .select()
      .single()

    if (error && String(error.message || '').toLowerCase().includes('activity_origin')) {
      const { activity_origin, ...legacyPayload } = payload
      const retry = await supabaseAdmin
        .from('pr_program')
        .insert(legacyPayload)
        .select()
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
