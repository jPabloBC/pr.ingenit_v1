import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabaseClient'
import { requireApiAccess, resolveScopedCompanyId } from '@/lib/apiAccess'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const access = await requireApiAccess({ resource: 'management' })
    if (!access.ok) return access.response

    const { searchParams } = new URL(request.url)
    const scope = resolveScopedCompanyId(access.actor, searchParams.get('companyId'))
    if (scope.response) return scope.response

    // Obtener departamentos de Supabase
    const { data: departments, error } = await supabase
      .from('departments')
      .select('*, employees(*)')
      .eq('companyId', scope.companyId)
    if (error) throw error

    return NextResponse.json(departments)
  } catch (error) {
    console.error('Error fetching departments:', error)
    return NextResponse.json(
      { error: 'Error fetching departments' }, 
      { status: 500 }
    )
  }
}
