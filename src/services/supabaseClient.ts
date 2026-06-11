import { supabase as supabaseLib } from '../lib/supabaseClient'

// Re-export the application-wide client to avoid creating multiple Supabase
// instances in the browser (prevents multiple GoTrueClient warnings).
export const supabase = supabaseLib
