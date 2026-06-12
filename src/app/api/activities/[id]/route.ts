import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const { data, error } = await supabaseAdmin
      .from('pr_program')
      .select('*')
      .eq('company_id', session.user.companyId)
      .eq('id', ctx.params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || null)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const payload: any = {
        item_id: body.item_id || null,
        sub_id: body.sub_id || null,
      discipline: body.discipline || null,
      area: body.area || null,
      activity: body.activity || null,
      package: body.package || null,
      description: body.description || null,
      tree_level_1: body.tree_level_1 || null,
      tree_level_2: body.tree_level_2 || null,
      tree_level_3: body.tree_level_3 || null,
      tree_level_4: body.tree_level_4 || null,
      tree_level_5: body.tree_level_5 || null,
      tree_path: body.tree_path || null,
      unit: body.unit || null,
      quantity: body.quantity ?? null,
      observations: body.observations || null,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('pr_program')
      .update(payload)
      .eq('company_id', session.user.companyId)
      .eq('id', ctx.params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    const { data, error } = await supabaseAdmin
      .from('pr_program')
      .delete()
      .eq('company_id', session.user.companyId)
      .eq('id', ctx.params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
