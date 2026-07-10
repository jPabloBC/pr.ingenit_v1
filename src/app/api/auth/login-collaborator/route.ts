import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabaseClient'
import bcrypt from 'bcrypt'

export async function POST(request: NextRequest) {
  try {
    const { companyId, document, password } = await request.json();
    if (!companyId || !document || !password) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
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
      return NextResponse.json({ error: 'Colaborador no encontrado o inactivo' }, { status: 401 });
    }

    // Comparar contraseña
    const passwordMatch = await bcrypt.compare(password, collaborator.password_hash);
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
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
