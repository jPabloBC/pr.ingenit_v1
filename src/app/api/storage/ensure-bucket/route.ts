import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAccess } from '@/lib/apiAccess'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  if (process.env.NODE_ENV === 'development') console.warn('SUPABASE service config missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false }
})

export async function POST(request: Request) {
  try {
    const access = await requireApiAccess({ resource: 'settings' })
    if (!access.ok) return access.response

    const body = await request.json()
  const bucket = body?.bucket || 'companies'

    // List buckets and check existence
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
    if (listError) {
      console.error('Error listando buckets:', listError)
      return NextResponse.json({ error: 'error_listing_buckets', details: listError.message }, { status: 500 })
    }

    const exists = (buckets || []).some((b: { name: string }) => b.name === bucket)
    if (exists) {
      return NextResponse.json({ ok: true, created: false, bucket })
    }

    // Create bucket (public by default here)
    const { data, error: createError } = await supabaseAdmin.storage.createBucket(bucket, { public: true })
    if (createError) {
      console.error('Error creando bucket:', createError)
      return NextResponse.json({ error: 'error_creating_bucket', details: createError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, created: true, bucket, data })
  } catch (err: unknown) {
    console.error('Unexpected error in ensure-bucket:', err)
    return NextResponse.json({ error: 'unexpected', details: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
