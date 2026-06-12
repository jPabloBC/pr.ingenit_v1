import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createClient } from '@supabase/supabase-js'
import { authOptions } from '../../../../lib/auth'

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase admin environment variables')
  return createClient(url, key)
}

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json([], { status: 200 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pr_management_interferences')
      .select('*')
      .eq('company_id', session.user.companyId)
      .order('created_at', { ascending: false })
      .limit(500)

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
    const role = String(session?.user?.role || '').toLowerCase()
    if (role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const workFront = String(body?.work_front || '').trim()
    const timeType = String(body?.time_type || 'Tiempo no contributivo').trim()
    const timeDetail = String(body?.time_detail || '').trim()
    const interferenceDate = String(body?.interference_date || '').trim()
    const startTime = String(body?.start_time || '').trim()
    const endTime = String(body?.end_time || '').trim()
    const note = String(body?.note || '').trim()
    const images = Array.isArray(body?.images) ? body.images : []

    if (!workFront) return NextResponse.json({ error: 'Frente es obligatorio' }, { status: 400 })
    if (!timeDetail) return NextResponse.json({ error: 'Detalle tipo es obligatorio' }, { status: 400 })
    if (!interferenceDate) return NextResponse.json({ error: 'Fecha es obligatoria' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const insertPayload = {
      company_id: session.user.companyId,
      work_front: workFront,
      time_type: timeType,
      time_detail: timeDetail,
      interference_date: interferenceDate,
      start_time: startTime || null,
      end_time: endTime || null,
      note,
      images,
      created_by_user_id: session.user.id || null,
      created_by_email: session.user.email || null,
    }

    const { data, error } = await supabaseAdmin
      .from('pr_management_interferences')
      .insert(insertPayload)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
