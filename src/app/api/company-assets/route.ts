import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const clean = (value: unknown) => String(value || '').trim()

const normalizeKeyPart = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)

const canManageCompanyAssets = (role: string) => {
  const normalized = role.toLowerCase()
  return normalized === 'admin' || normalized === 'dev'
}

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = String(session.user.companyId)
    const assetType = normalizeKeyPart(req.nextUrl.searchParams.get('asset_type'))
    const usageContext = normalizeKeyPart(req.nextUrl.searchParams.get('usage_context'))

    let query = supabaseAdmin
      .from('pr_company_assets')
      .select('id, company_id, asset_type, usage_context, name, description, provider, bucket, r2_key, public_url, content_type, file_size_bytes, width_px, height_px, sort_order, is_default, is_active, metadata, created_at, updated_at')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('asset_type', { ascending: true })
      .order('usage_context', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (assetType) query = query.eq('asset_type', assetType)
    if (usageContext) query = query.eq('usage_context', usageContext)

    const { data, error } = await query
    if (error) {
      console.error('Error fetching company assets:', error)
      return NextResponse.json({ error: 'Error al obtener imagenes corporativas' }, { status: 500 })
    }

    return NextResponse.json({ assets: data || [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = String(session?.user?.role || '').toLowerCase()
    if (!canManageCompanyAssets(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const companyId = String(session.user.companyId)
    const assetType = normalizeKeyPart(body?.asset_type || body?.assetType)
    const usageContext = normalizeKeyPart(body?.usage_context || body?.usageContext) || null
    const name = clean(body?.name)
    const r2Key = clean(body?.r2_key || body?.r2Key)
    const bucket = clean(body?.bucket || process.env.R2_BUCKET_NAME) || null
    const contentType = clean(body?.content_type || body?.contentType) || null
    const fileSizeBytes = Number(body?.file_size_bytes || body?.fileSizeBytes || 0)
    const widthPx = Number(body?.width_px || body?.widthPx || 0)
    const heightPx = Number(body?.height_px || body?.heightPx || 0)
    const isDefault = Boolean(body?.is_default ?? body?.isDefault ?? true)

    if (!assetType) return NextResponse.json({ error: 'asset_type requerido' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 })
    if (!r2Key) return NextResponse.json({ error: 'r2_key requerido' }, { status: 400 })
    if (!r2Key.startsWith(`company-assets/${companyId}/`)) {
      return NextResponse.json({ error: 'r2_key fuera de la empresa actual' }, { status: 403 })
    }

    if (isDefault) {
      let updateQuery = supabaseAdmin
        .from('pr_company_assets')
        .update({ is_default: false, updated_by: session.user.id || null, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('asset_type', assetType)
        .eq('is_default', true)
        .eq('is_active', true)

      updateQuery = usageContext === null
        ? updateQuery.is('usage_context', null)
        : updateQuery.eq('usage_context', usageContext)

      const { error: defaultError } = await updateQuery
      if (defaultError) {
        console.error('Error clearing company asset default:', defaultError)
        return NextResponse.json({ error: 'Error al actualizar predeterminado anterior' }, { status: 500 })
      }
    }

    const payload = {
      company_id: companyId,
      asset_type: assetType,
      usage_context: usageContext,
      name,
      description: clean(body?.description) || null,
      provider: 'r2',
      bucket,
      r2_key: r2Key,
      public_url: clean(body?.public_url || body?.publicUrl) || null,
      content_type: contentType,
      file_size_bytes: Number.isFinite(fileSizeBytes) && fileSizeBytes > 0 ? Math.round(fileSizeBytes) : null,
      width_px: Number.isFinite(widthPx) && widthPx > 0 ? Math.round(widthPx) : null,
      height_px: Number.isFinite(heightPx) && heightPx > 0 ? Math.round(heightPx) : null,
      sort_order: Number(body?.sort_order || body?.sortOrder || 0) || 0,
      is_default: isDefault,
      is_active: true,
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      created_by: session.user.id || null,
      updated_by: session.user.id || null
    }

    const { data, error } = await supabaseAdmin
      .from('pr_company_assets')
      .insert(payload)
      .select('id, company_id, asset_type, usage_context, name, description, provider, bucket, r2_key, public_url, content_type, file_size_bytes, width_px, height_px, sort_order, is_default, is_active, metadata, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error creating company asset:', error)
      return NextResponse.json({ error: 'Error al guardar imagen corporativa' }, { status: 500 })
    }

    return NextResponse.json({ asset: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = String(session?.user?.role || '').toLowerCase()
    if (!canManageCompanyAssets(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const companyId = String(session.user.companyId)
    const id = clean(body?.id)
    const action = clean(body?.action)
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { data: asset, error: assetError } = await supabaseAdmin
      .from('pr_company_assets')
      .select('id, company_id, asset_type, usage_context')
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle()

    if (assetError) return NextResponse.json({ error: 'Error al obtener imagen' }, { status: 500 })
    if (!asset) return NextResponse.json({ error: 'Imagen no encontrada' }, { status: 404 })

    if (action === 'set_default') {
      let clearQuery = supabaseAdmin
        .from('pr_company_assets')
        .update({ is_default: false, updated_by: session.user.id || null, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('asset_type', asset.asset_type)
        .eq('is_default', true)
        .eq('is_active', true)

      clearQuery = asset.usage_context === null
        ? clearQuery.is('usage_context', null)
        : clearQuery.eq('usage_context', asset.usage_context)

      const { error: clearError } = await clearQuery
      if (clearError) return NextResponse.json({ error: 'Error al limpiar predeterminado anterior' }, { status: 500 })

      const { data, error } = await supabaseAdmin
        .from('pr_company_assets')
        .update({ is_default: true, updated_by: session.user.id || null, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('id', id)
        .select('id, company_id, asset_type, usage_context, name, description, provider, bucket, r2_key, public_url, content_type, file_size_bytes, width_px, height_px, sort_order, is_default, is_active, metadata, created_at, updated_at')
        .single()

      if (error) return NextResponse.json({ error: 'Error al marcar predeterminado' }, { status: 500 })
      return NextResponse.json({ asset: data })
    }

    if (action === 'deactivate') {
      const { data, error } = await supabaseAdmin
        .from('pr_company_assets')
        .update({ is_active: false, is_default: false, updated_by: session.user.id || null, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('id', id)
        .select('id')
        .single()

      if (error) return NextResponse.json({ error: 'Error al desactivar imagen' }, { status: 500 })
      return NextResponse.json({ asset: data })
    }

    if (action === 'assign_transmittal') {
      const { data, error } = await supabaseAdmin
        .from('pr_company_assets')
        .update({ usage_context: 'transmittal', updated_by: session.user.id || null, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('id', id)
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: 'Error al asignar imagen a Transmittal' }, { status: 500 })
      return NextResponse.json({ asset: data })
    }

    return NextResponse.json({ error: 'action invalida' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
