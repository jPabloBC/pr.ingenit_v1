import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    if (!Array.isArray(body)) return NextResponse.json({ error: 'Expected an array' }, { status: 400 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const cleanText = (v: unknown) => {
      const s = String(v ?? '').replace(/\s+/g, ' ').trim()
      return s.length > 0 ? s : null
    }

    const parseNumeric = (v: unknown) => {
      if (v == null) return null
      const s = String(v).trim()
      if (!s) return null
      const n = Number(s.replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    const payload = body
      .map((item: any) => {
        const itemId = cleanText(item.item_id ?? item.ID ?? item.Id)
        const subId = cleanText(item.sub_id ?? item['Sub-ID'] ?? item.SubId)
        const discipline = cleanText(item.discipline ?? item.Disciplina)
        const description = cleanText(item.description)
        const rawActivity = cleanText(item.activity)
        const rawArea = cleanText(item.area)

        // pr_program.area y pr_program.activity son NOT NULL.
        // Usamos fallback explícito para evitar fallas 500 por filas parciales.
        const area = rawArea ?? 'SIN AREA'
        const activity = rawActivity ?? description ?? itemId ?? 'SIN ACTIVIDAD'

        const mapped = {
          company_id: session.user.companyId,
          item_id: itemId,
          sub_id: subId,
          area,
          activity,
          package: cleanText(item.package),
          discipline,
          description,
          tree_level_1: cleanText(item.tree_level_1),
          tree_level_2: cleanText(item.tree_level_2),
          tree_level_3: cleanText(item.tree_level_3),
          tree_level_4: cleanText(item.tree_level_4),
          tree_level_5: cleanText(item.tree_level_5),
          tree_path: cleanText(item.tree_path),
          unit: cleanText(item.unit),
          quantity: parseNumeric(item.quantity),
          observations: cleanText(item.observations),
        }

        const hasAnyData = Object.values(mapped).some((v) => v !== null && v !== '')
        return hasAnyData ? mapped : null
      })
      .filter(Boolean) as any[]

    if (payload.length === 0) {
      return NextResponse.json({ error: 'No hay filas válidas para importar' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.from('pr_program').insert(payload).select()

    if (error) {
      return NextResponse.json(
        { error: error.message, details: (error as any)?.details ?? null, hint: (error as any)?.hint ?? null },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
