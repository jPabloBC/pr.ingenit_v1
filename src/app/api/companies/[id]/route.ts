import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { IndustryType } from '@/types'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id: companyId } = await context.params

    // Verificar que el usuario tenga acceso a esta empresa
    if (session.user.companyId !== companyId) {
      return NextResponse.json({ error: 'No tienes acceso a esta empresa' }, { status: 403 })
    }

    // Obtener solo la información necesaria para colaboradores
    const { data: company, error: companyError } = await supabase
      .from('pr_companies')
      .select('id, industry, country, created_at, updated_at')
      .eq('id', companyId)
      .single()


    if (companyError) {
      console.error('Error fetching company:', companyError)
      return NextResponse.json({ error: 'Error al obtener información de la empresa' }, { status: 500 })
    }

    if (!company) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    // Mapear la industria a enum si es necesario
    let industry = company.industry
    
    if (typeof industry === 'string') {
      // Si la industria viene como string, mapearla al enum
      const industryMap: Record<string, IndustryType> = {
        'technology': IndustryType.TECHNOLOGY,
        'construction': IndustryType.CONSTRUCTION,
        'healthcare': IndustryType.HEALTHCARE,
        'education': IndustryType.EDUCATION,
        'other': IndustryType.OTHER
      }
      
      const mappedIndustry = industryMap[industry.toLowerCase()]
      
      if (mappedIndustry) {
        industry = mappedIndustry
      } else {
        // Si no está en el mapeo, mantener el string original para industrias personalizadas
        industry = industry // Mantener como string
      }
    }

    return NextResponse.json({
      id: company.id,
      industry: industry,
      country: company.country,
      createdAt: company.created_at,
      updatedAt: company.updated_at
    })
  } catch (error) {
    console.error('Error in companies API:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id: companyId } = await context.params

    // Verificar que el usuario tenga acceso a esta empresa
    if (session.user.companyId !== companyId) {
      return NextResponse.json({ error: 'No tienes acceso a esta empresa' }, { status: 403 })
    }

    // Parsear datos del request
    const body = await request.json()
    const {
      name,
      rut,
      address,
      phone,
      email,
      industry,
      country,
      website,
      description
    } = body

    // Actualizar datos de la empresa
    const { data: updatedCompany, error: updateError } = await supabase
      .from('pr_companies')
      .update({
        name,
        rut,
        address,
        phone,
        email,
        industry,
        country,
        website,
        description,
        updated_at: new Date().toISOString()
      })
      .eq('id', companyId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating company:', updateError)
      return NextResponse.json({ error: 'Error al actualizar la empresa' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Empresa actualizada exitosamente',
      data: updatedCompany
    })
  } catch (error) {
    console.error('Error in companies PUT API:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
