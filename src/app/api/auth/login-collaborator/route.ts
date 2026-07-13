import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabaseClient'
import bcrypt from 'bcrypt'
import {
  getAuthIdentifierHash,
  getClientIpHash,
  isCollaboratorLoginRateLimited,
  recordCollaboratorLoginAttempt,
} from '@/lib/authAttemptLimiter'

export async function POST(request: NextRequest) {
  try {
    const { companyId, document, password } = await request.json();
    if (!companyId || !document || !password) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }
    const identifierHash = getAuthIdentifierHash(`${companyId}:${document}`)
    const ipHash = getClientIpHash(request)
    try {
      if (await isCollaboratorLoginRateLimited(identifierHash, ipHash)) {
        return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
      }
    } catch (rateLimitError) {
      console.error('Collaborator login rate-limit check failed:', rateLimitError)
    }

    // Buscar colaborador activo por documento y empresa
    const { data: collaborator, error } = await supabase
      .from('pr_collaborators')
      .select('id, first_name, last_name, password_hash, is_active')
      .eq('company_id', companyId)
      .eq('document', document)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Error en la consulta' }, { status: 500 });
    }
    if (!collaborator) {
      try {
        await recordCollaboratorLoginAttempt({ identifierHash, ipHash, success: false })
      } catch (attemptError) {
        console.error('Collaborator login attempt could not be recorded:', attemptError)
      }
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // Comparar contraseña
    const passwordMatch = await bcrypt.compare(password, collaborator.password_hash);
    if (!passwordMatch) {
      try {
        await recordCollaboratorLoginAttempt({ identifierHash, ipHash, success: false })
      } catch (attemptError) {
        console.error('Collaborator login attempt could not be recorded:', attemptError)
      }
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    try {
      await recordCollaboratorLoginAttempt({ identifierHash, ipHash, success: true })
    } catch (attemptError) {
      console.error('Successful collaborator login could not be recorded:', attemptError)
    }

    // Puedes generar un token JWT aquí si lo necesitas
    return NextResponse.json({
      success: true,
      collaborator: {
        id: collaborator.id,
        first_name: collaborator.first_name,
        last_name: collaborator.last_name
      }
    });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
