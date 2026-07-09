import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { requireApiAccess } from '@/lib/apiAccess';

export async function GET() {
  try {
    const access = await requireApiAccess({ resource: 'attendance' });
    if (!access.ok) return access.response;

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
        collaborators:collaborator_id!inner (
          first_name,
          last_name,
          email,
          phone,
          position,
          document
        )
      `)
      .eq('collaborators.company_id', access.actor.companyId);

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
