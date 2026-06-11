import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest, ctx: any) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

    // Get crew
    const id = ctx.params.id
    const { data: crew, error: crewErr } = await supabaseAdmin
      .from('pr_crews')
      .select('*')
      .eq('company_id', session.user.companyId)
      .eq('id', id)
      .single()
    if (crewErr) return NextResponse.json({ error: crewErr.message }, { status: 500 })

    // Get members with collaborator details
    const { data: members, error: membersErr } = await supabaseAdmin
      .from('pr_crew_members')
      .select('collaborator_id, pr_collaborators(id, first_name, last_name, position, specialty, phone, document)')
      .eq('crew_id', id)

    if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 })

    // Normalize to simple array of collaborators
    const collaborators = (members || []).map((m: any) => {
      const c = m.pr_collaborators || null
      if (!c) return { id: String(m.collaborator_id) }
      return {
        id: String(c.id),
        first_name: c.first_name,
        last_name: c.last_name,
        position: c.position,
        specialty: c.specialty,
        phone: c.phone,
        document: c.document
      }
    })

    return NextResponse.json({ crew, collaborators })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
