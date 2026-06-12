import { createClient } from '@supabase/supabase-js';

// Hardcoding Supabase URL and ANON KEY for testing purposes
const SUPABASE_URL = 'https://juupotamdjqzpxuqdtco.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1dXBvdGFtZGpxenB4dXFkdGNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MDIyMTgsImV4cCI6MjA2NTI3ODIxOH0.8aXgTBg4vhs0DmTKPg9WGTvQ9hHBd_uCGHgt89ZfM_E';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
