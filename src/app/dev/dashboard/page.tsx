import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'

export default async function Page() {
  const session = await getServerSession(authOptions as any) as any
  if (!session?.user || String(session.user.role) !== 'dev') {
    return redirect('/dev/signin')
  }
  return redirect('/dev/summary')
}
