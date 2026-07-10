import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabaseClient'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
    }

    // Obtener departamentos de Supabase
    const { data: departments, error } = await supabase
      .from('departments')
      .select('*, employees(*)')
      .eq('companyId', companyId)
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