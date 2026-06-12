import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'dev') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = params.id
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await req.json()
    const { can_view } = body
    if (typeof can_view !== 'boolean') return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('pr_user_permissions')
      .update({ can_view })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ permission: data })
  } catch (err) {
    console.error('PATCH /api/dev/user-permissions/[id]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
