import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { createClient } from '@supabase/supabase-js'
// import bcrypt from 'bcrypt'
import bcrypt from 'bcrypt'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const companyId = session.user.companyId

    // Obtener colaboradores desde pr_collaborators
    const { data: collaborators, error: collaboratorsError } = await supabase
      .from('pr_collaborators')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (collaboratorsError) {
      console.error('Error fetching collaborators:', collaboratorsError)
      return NextResponse.json({ error: 'Error al obtener colaboradores' }, { status: 500 })
    }

    return NextResponse.json(collaborators || [])
  } catch (error) {
    console.error('Error in collaborators API:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 POST /api/collaborators - Iniciando...')
    
    const session = await getServerSession(authOptions)
    console.log('👤 Sesión obtenida:', session?.user?.email)
    
    if (!session?.user?.companyId) {
      console.log('❌ No autorizado - falta companyId')
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    console.log('📥 Parseando body...')
    let body
    try {
      body = await request.json()
      console.log('📥 Datos recibidos en API:', body)
    } catch (parseError) {
      console.error('❌ Error al parsear JSON:', parseError)
      return NextResponse.json({ error: 'Error al parsear datos JSON' }, { status: 400 })
    }

    const {
      first_name, 
      last_name, 
      document, 
      email, 
      phone, 
      address, 
      position, 
      worker_type, 
      salary, 
      birth_date, 
      hire_date, 
      emergency_contact, 
      upper_clothing_size, 
      lower_clothing_size, 
      shoe_size, 
      gender,
      photo_url,
      epp_details, 
      is_active, 
      company_id 
    } = body

  // (POST) Creating a collaborator requires name and email; validate below

    // Verificar si ya existe un colaborador con este email
    console.log('🔍 Verificando si ya existe un colaborador con este email...')
    const { data: existingCollaborator, error: checkError } = await supabase
      .from('pr_collaborators')
      .select('id, email')
      .eq('email', email)
      .eq('company_id', company_id || session.user.companyId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ Error al verificar colaborador existente:', checkError)
      return NextResponse.json({ error: 'Error al verificar colaborador existente' }, { status: 500 })
    }

    if (existingCollaborator) {
      console.log('⚠️ Ya existe un colaborador con este email:', existingCollaborator.email)
      return NextResponse.json({ 
        error: 'Colaborador ya existe', 
        details: 'Ya existe un colaborador con este email en la empresa. Por favor usa un email diferente.',
        code: 'COLLABORATOR_EXISTS'
      }, { status: 409 })
    }

    // Crear cliente de Supabase con clave de servicio para operaciones de admin
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!serviceRoleKey) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurada')
      return NextResponse.json({ 
        error: 'Configuración faltante', 
        details: 'La clave de servicio de Supabase no está configurada. Contacta al administrador.',
        code: 'MISSING_SERVICE_KEY'
      }, { status: 500 })
    }
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // Obtener la contraseña inicial enviada desde el frontend
    const plainPassword = body.password
    let passwordHash: string | undefined = undefined
    if (plainPassword) {
      // Hashear la contraseña con bcrypt
      const saltRounds = 10
      passwordHash = await bcrypt.hash(plainPassword, saltRounds)
    }

    // Crear colaborador en Supabase Auth primero
    console.log('🔐 Creando usuario en Supabase Auth para:', email)
    let { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: plainPassword || 'temp_password_123', // Usar la contraseña generada si existe
      email_confirm: true
    })

    // Track the resulting user id (either newly created or existing)
    let userId: string | null = authData?.user?.id ?? null

    if (authError) {
      console.error('❌ Error creating auth user:', authError)
      console.error('❌ Error details:', JSON.stringify(authError, null, 2))
      
      // Si el usuario ya existe, intentar obtener su ID
      if (authError.message.includes('already been registered')) {
        console.log('🔄 Usuario ya existe, buscando usuario existente...')
        
        // Buscar el usuario existente por email
        const { data: existingUser, error: getUserError } = await supabaseAdmin.auth.admin.listUsers()
        
        if (getUserError) {
          console.error('❌ Error al buscar usuario existente:', getUserError)
          return NextResponse.json({ 
            error: 'Error al buscar usuario existente', 
            details: getUserError.message,
            code: getUserError.status 
          }, { status: 500 })
        }
        
        const user = existingUser.users.find(u => u.email === email)
        if (user) {
          console.log('✅ Usuario existente encontrado:', user.id)
          // Usar el ID del usuario existente
          userId = user.id
        } else {
          return NextResponse.json({ 
            error: 'Usuario ya existe', 
            details: 'Ya existe un usuario con este email. Por favor usa un email diferente.',
            code: 'USER_EXISTS'
          }, { status: 409 })
        }
      } else {
        return NextResponse.json({ 
          error: 'Error al crear usuario', 
          details: authError.message,
          code: authError.status 
        }, { status: 500 })
      }
    }

    // If we didn't already set userId from an existing user, read it from authData
    userId = userId ?? authData?.user?.id ?? null
    console.log('✅ Usuario en Auth id:', userId)

    // Crear registro en pr_collaborators
    console.log('📝 Creando registro en pr_collaborators...')
    const collaboratorRecord = {
      user_id: userId,
      company_id: company_id || session.user.companyId,
      first_name,
      last_name,
      document: document, // Usar 'document' en lugar de 'rut'
      email,
      phone,
      address,
      position,
      worker_type,
      salary,
      birth_date,
      hire_date,
      emergency_contact,
      upper_clothing_size,
      lower_clothing_size,
      shoe_size,
      gender,
      photo_url,
      epp_details: epp_details || {},
      is_active: is_active !== undefined ? is_active : true,
      password_hash: passwordHash // Guardar el hash en la tabla
    }
    
    console.log('📋 Datos de colaborador a insertar:', collaboratorRecord)
    
    const { data: collaboratorData, error: collaboratorError } = await supabaseAdmin
      .from('pr_collaborators')
      .insert(collaboratorRecord)
      .select()
      .single()

    if (collaboratorError) {
      console.error('❌ Error creating collaborator record:', collaboratorError)
      console.error('❌ Error details:', JSON.stringify(collaboratorError, null, 2))
      
      // Manejar específicamente el error de clave foránea
      if (collaboratorError.code === '23503') {
        console.error('❌ Violación de clave foránea detectada')
        return NextResponse.json({ 
          error: 'Error de integridad de datos', 
          details: 'Hay un problema con las relaciones de la base de datos. El usuario no puede ser asociado correctamente.',
          code: 'FOREIGN_KEY_VIOLATION',
          originalError: collaboratorError.message
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: 'Error al crear registro de colaborador', 
        details: collaboratorError.message,
        code: collaboratorError.code 
      }, { status: 500 })
    }

    console.log('✅ Colaborador creado exitosamente:', collaboratorData.id)

    console.log('✅ Colaborador creado exitosamente:', collaboratorData)
    return NextResponse.json(collaboratorData)
  } catch (error) {
    console.error('❌ Error in collaborators POST:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('❌ Error message:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log('🚀 PUT /api/collaborators - Iniciando actualización...')
    
    const session = await getServerSession(authOptions)
    console.log('👤 Sesión obtenida:', session?.user?.email)
    
    if (!session?.user?.companyId) {
      console.log('❌ No autorizado - falta companyId')
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    console.log('📥 Parseando body...')
    let body
    try {
      body = await request.json()
      console.log('📥 Datos recibidos en API:', body)
    } catch (parseError) {
      console.error('❌ Error al parsear JSON:', parseError)
      return NextResponse.json({ error: 'Error al parsear datos JSON' }, { status: 400 })
    }

    const { 
      id,
      first_name, 
      last_name, 
      document, 
      email, 
      phone, 
      address, 
      position, 
      worker_type, 
      salary, 
      birth_date, 
      hire_date, 
      emergency_contact, 
      upper_clothing_size, 
      lower_clothing_size, 
      shoe_size, 
      gender,
      photo_url,
      epp_details, 
      is_active, 
      company_id 
    } = body

    if (!id) {
      return NextResponse.json({ error: 'ID del colaborador es requerido' }, { status: 400 })
    }

    // Solo exigir los campos obligatorios si se intenta actualizar alguno de ellos
    const wantsToUpdateNameOrEmail =
      (first_name !== undefined || last_name !== undefined || email !== undefined)
    if (wantsToUpdateNameOrEmail) {
      if (!first_name || !last_name || !email) {
        return NextResponse.json({ error: 'Nombre, apellido y email son requeridos' }, { status: 400 })
      }
    }

    // Allow partial updates: if caller only wants to update photo_url, is_active, etc.
    const isPartialUpdate = !wantsToUpdateNameOrEmail

  // Crear cliente de Supabase con clave de servicio para operaciones de admin
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!serviceRoleKey) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurada')
      return NextResponse.json({ 
        error: 'Configuración faltante', 
        details: 'La clave de servicio de Supabase no está configurada. Contacta al administrador.',
        code: 'MISSING_SERVICE_KEY'
      }, { status: 500 })
    }
    
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // Actualizar registro en pr_collaborators
    console.log('📝 Actualizando registro en pr_collaborators...')

    // Build update object only with provided fields to allow partial updates (eg. only photo_url)
    const updatePayload: Record<string, any> = {}

    const maybeSet = (key: string, value: any) => {
      if (value !== undefined) updatePayload[key] = value
    }

    // If it's not a partial update, require core fields
    if (!isPartialUpdate) {
      maybeSet('first_name', first_name)
      maybeSet('last_name', last_name)
      maybeSet('email', email)
    }

    // Always allow updating these if provided
    maybeSet('document', document)
    maybeSet('phone', phone)
    maybeSet('address', address)
    maybeSet('position', position)
    maybeSet('worker_type', worker_type)
    maybeSet('salary', salary)
    maybeSet('birth_date', birth_date)
    maybeSet('hire_date', hire_date)
    maybeSet('emergency_contact', emergency_contact)
    maybeSet('upper_clothing_size', upper_clothing_size)
    maybeSet('lower_clothing_size', lower_clothing_size)
    maybeSet('shoe_size', shoe_size)
    maybeSet('gender', gender)
    maybeSet('photo_url', photo_url)
    maybeSet('epp_details', epp_details || {})
    if (is_active !== undefined) updatePayload.is_active = is_active

    console.log('📋 Datos de colaborador a actualizar:', updatePayload)

    // Ensure the collaborator belongs to the same company as the session user
    const { data: existing, error: existsErr } = await supabaseAdmin
      .from('pr_collaborators')
      .select('company_id')
      .eq('id', id)
      .single()

    if (existsErr) {
      console.error('❌ Error comprobando existencia del colaborador:', existsErr)
      return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })
    }

    if (existing.company_id !== session.user.companyId) {
      console.error('❌ Intento de actualizar colaborador de otra empresa')
      return NextResponse.json({ error: 'No autorizado para actualizar este colaborador' }, { status: 403 })
    }

    const { data: collaboratorData, error: collaboratorError } = await supabaseAdmin
      .from('pr_collaborators')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (collaboratorError) {
      console.error('❌ Error updating collaborator record:', collaboratorError)
      console.error('❌ Error details:', JSON.stringify(collaboratorError, null, 2))
      
      return NextResponse.json({ 
        error: 'Error al actualizar registro de colaborador', 
        details: collaboratorError.message,
        code: collaboratorError.code 
      }, { status: 500 })
    }

    console.log('✅ Colaborador actualizado exitosamente:', collaboratorData)
    return NextResponse.json(collaboratorData)
  } catch (error) {
    console.error('❌ Error in collaborators PUT:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('❌ Error message:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
