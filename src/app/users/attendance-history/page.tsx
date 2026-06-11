'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AttendanceHistoryRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/users/attendance?tab=historica')
  }, [router])

  return null
}
