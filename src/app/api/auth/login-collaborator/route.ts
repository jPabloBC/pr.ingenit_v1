import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabaseClient'
import bcrypt from 'bcrypt'
import { checkAuthRateLimit, getRequestIp, recordAuthAttempt } from '../../../../lib/authRateLimit'

export async function POST(request: NextRequest) {
  try {
    const { companyId, document, password } = await request.json();
    if (!companyId || !document || !password) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }
    const ip = getRequestIp(request.headers)
    const authIdentifier = `${companyId}:${document}`
    const rateLimit = await checkAuthRateLimit({
      action: 'collaborator_signin',
      email: authIdentifier,
      ip,
      maxAttempts: 8,
      windowSeconds: 15 * 60,
    })
    if (!rateLimit.allowed) {
      await recordAuthAttempt({
        action: 'collaborator_signin',
        email: authIdentifier,
        ip,
        success: false,
        metadata: { reason: 'rate_limited' },
      })
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
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
      await recordAuthAttempt({
        action: 'collaborator_signin',
        email: authIdentifier,
        ip,
        success: false,
        metadata: { reason: 'not_found_or_inactive' },
      })
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // Comparar contraseña
    const passwordMatch = collaborator.password_hash
      ? await bcrypt.compare(password, collaborator.password_hash)
      : false;
    if (!passwordMatch) {
      await recordAuthAttempt({
        action: 'collaborator_signin',
        email: authIdentifier,
        ip,
        success: false,
        metadata: { reason: 'invalid_credentials' },
      })
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    await recordAuthAttempt({
      action: 'collaborator_signin',
      email: authIdentifier,
      ip,
      success: true,
    })

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
