import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('pr_attendance')
      .select(`
        id,
        collaborator_id,
        check_in,
        check_out,
        status,
        latitude_in,
        longitude_in,
        latitude_out,
        longitude_out,
        collaborators:collaborator_id (
          first_name,
          last_name,
          email,
          phone,
          position,
          document
        )
      `);

    if (error) {
      console.debug('Error fetching attendance data:', error);
      return NextResponse.json({ error: 'Error fetching attendance data' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.debug('Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}