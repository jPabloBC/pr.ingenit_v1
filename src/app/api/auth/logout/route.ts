import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

// Log environment variables to ensure they are loaded correctly
if (process.env.NODE_ENV === 'development') {
  console.info('Auth/logout route active (development)')
}

// Cierra sesión: actualiza is_online y last_activity usando el id recibido por body
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const collaboratorId = body.id
    if (!collaboratorId) {
      console.error('Logout request missing collaboratorId')
      return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    }
    if (process.env.NODE_ENV === 'development') {
      console.debug('Processing logout for collaboratorId:', collaboratorId)
      // only log non-sensitive request summary in development
      console.debug('Request method:', request.method)
      const headersSummary: Record<string,string> = {}
      for (const [k] of request.headers) headersSummary[k] = k === 'authorization' ? 'REDACTED' : '...'
      console.debug('Request headers (summary):', headersSummary)
    }

    // Handle Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (process.env.NODE_ENV === 'development') console.debug('Authorization header present')

    // Ensure the collaborator exists before attempting to update
    const { data: collaborator, error: fetchError } = await supabaseAdmin
      .from('pr_collaborators')
      .select('id')
      .eq('id', collaboratorId)
      .single()

    if (fetchError || !collaborator) {
      if (process.env.NODE_ENV === 'development') console.warn(`Logout attempt for non-existent collaboratorId: ${collaboratorId}. Proceeding with logout.`, fetchError)
      // If collaborator doesn't exist, they are effectively logged out.
      // Return success to allow the client to clear its local session.
      const response = NextResponse.json({ success: true, message: 'Collaborator not found, but logout processed.' });
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      return response;
    }

    if (process.env.NODE_ENV === 'development') console.debug('Collaborator found, proceeding with logout:', collaboratorId)

    if (process.env.NODE_ENV === 'development') console.debug('Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone)

    const fixedTime = new Date(Date.UTC(2025, 9, 17, 12, 0, 0)).toISOString()
    if (process.env.NODE_ENV === 'development') console.debug('Fixed UTC time for testing:', fixedTime)

    const { data: updatedCollaborator, error: updateError } = await supabaseAdmin
      .from('pr_collaborators')
      .update({
        is_online: false,
        last_activity: fixedTime // Use fixed UTC time for testing
      })
      .eq('id', collaboratorId)
      .select('last_activity');

    if (updateError) {
      console.error('Error updating collaborator in database:', updateError)
      return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
    }
    if (process.env.NODE_ENV === 'development') console.debug('Database stored last_activity:', updatedCollaborator?.[0]?.last_activity)
    if (process.env.NODE_ENV === 'development') console.info('Logout successful for collaboratorId:', collaboratorId)

    const response = NextResponse.json({ success: true });
    // Set CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    
    return response;
  } catch (e) {
    console.error('Unexpected error during logout process:', e)
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 });
  }
}

export async function OPTIONS() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  return new NextResponse(null, { status: 204, headers });
}
