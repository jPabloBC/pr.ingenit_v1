import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const FORM_CODE_RE = /^F_[A-Za-z0-9_-]{8}$/
const INVITATION_CODE_RE = /^I_[A-Za-z0-9_-]{12}$/

const redirectWithoutCache = (req: NextRequest, destination: string) => {
  const response = NextResponse.redirect(new URL(destination, req.url))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = String(params.code || '').trim()

    if (FORM_CODE_RE.test(code)) {
      const { data: form, error } = await supabaseAdmin
        .from('pr_communication_forms')
        .select('id')
        .eq('short_code', code)
        .maybeSingle()

      if (error) {
        return NextResponse.json(
          { error: 'No fue posible resolver el enlace.' },
          { status: 500 }
        )
      }

      if (!form) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      return redirectWithoutCache(req, `/forms/${form.id}`)
    }

    if (INVITATION_CODE_RE.test(code)) {
      const { data: invitation, error } = await supabaseAdmin
        .from('pr_communication_form_invitations')
        .select('access_token')
        .eq('short_code', code)
        .maybeSingle()

      if (error) {
        return NextResponse.json(
          { error: 'No fue posible resolver el enlace.' },
          { status: 500 }
        )
      }

      if (!invitation) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      return redirectWithoutCache(req, `/forms/${invitation.access_token}`)
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json(
      { error: 'No fue posible resolver el enlace.' },
      { status: 500 }
    )
  }
}
