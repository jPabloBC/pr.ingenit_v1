import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const normalizeFront = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, ' ')

const titleCaseDocument = (value: unknown) => {
  const minorWords = new Set(['a', 'al', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'y'])
  const acronyms = new Set(['HDPE', 'ILS', 'NOC', 'OTEC', 'UDR'])
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, index) => {
      const upper = word.toLocaleUpperCase('es-CL')
      if (acronyms.has(upper) || /\d/.test(word)) return upper
      const lower = word.toLocaleLowerCase('es-CL')
      if (index > 0 && minorWords.has(lower)) return lower
      return lower.charAt(0).toLocaleUpperCase('es-CL') + lower.slice(1)
    })
    .join(' ')
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions) as any
  const companyId = String(session?.user?.companyId || '')
  if (!companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (request.nextUrl.searchParams.get('dates') === '1') {
    const { data, error } = await supabaseAdmin
      .from('pr_daily_reports')
      .select('report_date')
      .eq('company_id', companyId)
      .not('report_date', 'is', null)
      .order('report_date', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const dates = Array.from(new Set((data || []).map((row: any) => String(row.report_date || '').slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))))
    return NextResponse.json({ dates })
  }

  const date = String(request.nextUrl.searchParams.get('date') || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })

  const [dailyResult, fieldResult, frontsResult] = await Promise.all([
    supabaseAdmin
      .from('pr_daily_reports')
      .select('id, report_no, report_date, work_front')
      .eq('company_id', companyId)
      .eq('report_date', date)
      .order('work_front', { ascending: true }),
    supabaseAdmin
      .from('pr_field_reports')
      .select('id, date, report_sequence_no, report_title, work_front, work_front_id')
      .eq('company_id', companyId)
      .eq('date', date)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('pr_report_fronts')
      .select('id, name, type')
      .eq('company_id', companyId)
  ])

  if (dailyResult.error) return NextResponse.json({ error: dailyResult.error.message }, { status: 500 })
  if (fieldResult.error) return NextResponse.json({ error: fieldResult.error.message }, { status: 500 })
  if (frontsResult.error) return NextResponse.json({ error: frontsResult.error.message }, { status: 500 })

  const frontById = new Map((frontsResult.data || []).map((front: any) => [String(front.id || ''), front]))
  const frontByName = new Map((frontsResult.data || []).map((front: any) => [normalizeFront(front.name), front]))
  const dailyDocuments = (dailyResult.data || []).map((report: any) => ({
    ...report,
    document_type: 'daily_report',
    document_name: `Daily Report ${titleCaseDocument(report.work_front)} N°${String(report.report_no || '').padStart(3, '0')}`
  }))
  const udrDocuments = (fieldResult.data || [])
    .filter((report: any) => {
      const configuredFront = frontById.get(String(report.work_front_id || '')) || frontByName.get(normalizeFront(report.work_front))
      return String(configuredFront?.type || '').trim().toLowerCase() === 'udr' || normalizeFront(report.work_front).includes('USO DE RECURSOS')
    })
    .map((report: any) => {
      const sequenceNo = Number(report.report_sequence_no || 0)
      const rawTitle = String(report.report_title || '').trim() || `${String(report.work_front || '').trim()}${sequenceNo > 0 ? ` N°${String(sequenceNo).padStart(3, '0')}` : ''}`
      return {
        id: report.id,
        report_no: sequenceNo || null,
        report_date: report.date,
        work_front: report.work_front,
        document_type: 'field_report',
        document_name: titleCaseDocument(rawTitle.replace(/^REPORTE\s+/i, ''))
      }
    })

  return NextResponse.json([...dailyDocuments, ...udrDocuments])
}
