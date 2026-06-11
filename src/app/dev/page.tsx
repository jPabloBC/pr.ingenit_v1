import { redirect } from 'next/navigation'

export default function DevIndex() {
  // Server-side redirect to avoid client flash
  redirect('/dev/signin')
}
