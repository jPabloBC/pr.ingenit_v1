#!/usr/bin/env node
/*
  Usage: node scripts/reset-collaborator-password.js <document> <newPassword>
  This script uses SUPABASE_SERVICE_ROLE_KEY from .env.local to update the password_hash
  for the collaborator with the given document. It hashes the password with bcrypt.
*/
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')
const bcrypt = require('bcryptjs')

dotenv.config({ path: './.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase config in .env.local (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: node scripts/reset-collaborator-password.js <document> <newPassword>')
    process.exit(1)
  }
  const [document, newPassword] = args

  try {
    // Find collaborator by document
    const { data: collab, error: selectErr } = await supabase
      .from('pr_collaborators')
      .select('id, document, company_id')
      .eq('document', document)
      .maybeSingle()

    if (selectErr) {
      console.error('Error fetching collaborator:', selectErr)
      process.exit(1)
    }
    if (!collab) {
      console.error('No collaborator found with document:', document)
      process.exit(1)
    }

    const hash = await bcrypt.hash(newPassword, 12)

    const { data, error } = await supabase
      .from('pr_collaborators')
      .update({ password_hash: hash })
      .eq('id', collab.id)

    if (error) {
      console.error('Error updating password_hash:', error)
      process.exit(1)
    }

    process.exit(0)
  } catch (e) {
    console.error('Unexpected error:', e)
    process.exit(1)
  }
}

main()
