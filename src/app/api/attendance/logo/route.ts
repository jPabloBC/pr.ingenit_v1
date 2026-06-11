import { NextResponse } from 'next/server'

const TEMP_ATTENDANCE_EXCEL_LOGO_URL = 'https://juupotamdjqzpxuqdtco.supabase.co/storage/v1/object/sign/pr_ingenit/puma/logotipo-PUMA.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hZjQ4NGRkOS0zZDMzLTRlYTMtYTZhZi03NTc3ZTk0ODI0ZDQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwcl9pbmdlbml0L3B1bWEvbG9nb3RpcG8tUFVNQS5wbmciLCJpYXQiOjE3NzkxMjA0NDEsImV4cCI6MTgxMDY1NjQ0MX0.eh9RCVS6wYrk0zO0sihTN_tuN8czNdhEPoROS7uy6kE'

export async function GET() {
  try {
    const response = await fetch(TEMP_ATTENDANCE_EXCEL_LOGO_URL, {
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Logo not available' }, { status: response.status })
    }

    const buffer = await response.arrayBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error || 'Logo fetch failed') }, { status: 500 })
  }
}
