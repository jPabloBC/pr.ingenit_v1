import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

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

export async function GET(_req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
    const crewsSource = _req.nextUrl.searchParams.get('source') === 'crews'
    let query = supabaseAdmin
      .from('pr_program')
      .select('unit')
      .eq('company_id', session.user.companyId)
      .not('unit', 'is', null)
      .order('unit', { ascending: true })
      .limit(5000)

    if (crewsSource) query = query.eq('activity_origin', 'crew_created')

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const uniq = Array.from(
      new Set(
        (data || [])
          .map((r: any) => toCanonicalUnit(r?.unit))
          .filter(Boolean)
      )
    ) as string[]
    return NextResponse.json(uniq)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
