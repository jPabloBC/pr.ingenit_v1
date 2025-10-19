import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { z } from 'zod'

const employeeSchema = z.object({
  rut: z.string().min(1, 'RUT es requerido'),
  firstName: z.string().min(1, 'Nombre es requerido'),
  lastName: z.string().min(1, 'Apellido es requerido'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  address: z.string().optional(),
  position: z.string().min(1, 'Cargo es requerido'),
  salary: z.number().min(0, 'Salario debe ser mayor a 0'),
  hireDate: z.string().transform(str => new Date(str)),
  birthDate: z.string().transform(str => new Date(str)).optional(),
  emergencyContact: z.string().optional(),
  departmentId: z.string().min(1, 'Departamento es requerido')
})

// GET - Obtener empleados
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const search = searchParams.get('search')
    const departmentId = searchParams.get('departmentId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
    }

    const where = {
      companyId,
      isActive: true,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { rut: { contains: search, mode: 'insensitive' as const } }
        ]
      }),
      ...(departmentId && { departmentId })
    }

    // Obtener empleados de Supabase
    const { data: employees, error } = await supabase
      .from('employees')
      .select('*, department(*), company(*)')
      .match(where)
      .range((page - 1) * limit, (page - 1) * limit + limit - 1)
      .order('createdAt', { ascending: false })
    if (error) throw error

    // Contar empleados en Supabase
    const { count, error: countError } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .match(where)
    if (countError) throw countError

    return NextResponse.json({
      employees,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { error: 'Error fetching employees' }, 
      { status: 500 }
    )
  }
}

// POST - Crear empleado
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Obtener companyId de la sesión o del body
    const companyId = body.companyId
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
    }

    const validatedData = employeeSchema.parse(body)

    // Verificar que el RUT no exista
    // Buscar empleado existente por rut
    const { data: existingEmployee, error: existingEmployeeError } = await supabase
      .from('employees')
      .select('*')
      .eq('rut', validatedData.rut)
      .limit(1)
    if (existingEmployeeError) throw existingEmployeeError

    if (existingEmployee) {
      return NextResponse.json(
        { error: 'Ya existe un empleado con este RUT' },
        { status: 409 }
      )
    }

    // Verificar que el email no exista
    // Buscar empleado existente por email
    const { data: existingEmail, error: existingEmailError } = await supabase
      .from('employees')
      .select('*')
      .eq('email', validatedData.email)
      .limit(1)
    if (existingEmailError) throw existingEmailError

    if (existingEmail) {
      return NextResponse.json(
        { error: 'Ya existe un empleado con este email' },
        { status: 409 }
      )
    }

    // Crear empleado en Supabase
    const { data: employee, error: createError } = await supabase
      .from('employees')
      .insert([{ ...validatedData, companyId }])
      .select()
    if (createError) throw createError

    return NextResponse.json(employee, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Datos de validación incorrectos',
          details: error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        },
        { status: 400 }
      )
    }
    
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { error: 'Error creating employee' },
      { status: 500 }
    )
  }
}