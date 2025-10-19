import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Log environment variables to ensure they are loaded correctly
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY);

// Log Supabase client initialization
console.log('Supabase client initialized:', supabaseAdmin);

// Cierra sesión: actualiza is_online y last_activity usando el id recibido por body
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const collaboratorId = body.id
    if (!collaboratorId) {
      console.error('Logout request missing collaboratorId')
      return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    }
    console.log('Processing logout for collaboratorId:', collaboratorId)

    // Log the request details
    console.log('Request method:', request.method);
    console.log('Request headers:', Object.fromEntries(request.headers));
    console.log('Request body:', body);
    console.log('Received request headers:', Object.fromEntries(request.headers));
    console.log('Received request body:', body);

    // Handle Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Authorization header:', authHeader);

    // Ensure the collaborator exists before attempting to update
    const { data: collaborator, error: fetchError } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id')
      .eq('id', collaboratorId)
      .single()

    if (fetchError || !collaborator) {
      console.warn(`Logout attempt for non-existent collaboratorId: ${collaboratorId}. Proceeding with logout.`, fetchError);
      // If collaborator doesn't exist, they are effectively logged out.
      // Return success to allow the client to clear its local session.
      const response = NextResponse.json({ success: true, message: 'Collaborator not found, but logout processed.' });
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      return response;
    }

    console.log('Collaborator found, proceeding with logout:', collaboratorId)

    console.log('Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);

    const fixedTime = new Date(Date.UTC(2025, 9, 17, 12, 0, 0)).toISOString();
    console.log('Fixed UTC time for testing:', fixedTime);

    const { data: updatedCollaborator, error: updateError } = await supabaseAdmin
      .from('pr_collaborators')
      .update({
        is_online: false,
        last_activity: fixedTime // Use fixed UTC time for testing
      })
      .eq('id', collaboratorId)
      .select('last_activity');

    if (updateError) {
      console.error('Error updating collaborator in database:', updateError);
      return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
    }

    console.log('Database stored last_activity:', updatedCollaborator?.[0]?.last_activity);

    console.log('Logout successful for collaboratorId:', collaboratorId)

    const response = NextResponse.json({ success: true });
    // Set CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    
    return response;
  } catch (e) {
    console.error('Unexpected error during logout process:', e);
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  return new NextResponse(null, { status: 204, headers });
}
