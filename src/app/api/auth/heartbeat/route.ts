import { NextResponse } from 'next/server'

// Heartbeat no-op: returns 200 OK without touching DB.
// This avoids requiring migrations when the DB schema is not present.
export async function POST() {
  return NextResponse.json({ success: true })
}
