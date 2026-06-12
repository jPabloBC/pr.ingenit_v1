"use client"
import React, { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'

export default function CompanyUsersPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams() as { companyId?: string }
  const companyId = params?.companyId
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !companyId) return
    if (String(session.user?.role) !== 'dev') return
    setLoading(true)
    fetch(`/api/dev/companies/${companyId}/users`)
      .then(r => r.json())
      .then(j => setUsers(j.users || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [session, companyId])

  if (!session) return <div>No autenticado</div>
  if (String(session.user?.role) !== 'dev') return <div>Acceso restringido</div>
  if (!companyId) return <div>Empresa no especificada</div>

  const setRole = async (userId: string, role: string) => {
    setSavingId(userId)
    try {
      const res = await fetch(`/api/dev/companies/${companyId}/users`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: j.user?.role || role } : u))
    } catch (e) {
      console.error(e)
      alert('Error actualizando rol')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <button onClick={() => router.push('/dev')}>Volver</button>
      <h2>Usuarios de la empresa {companyId}</h2>
      {loading && <div>Cargando...</div>}
      {!loading && users.length === 0 && <div>No hay usuarios</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8 }}>Nombre</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Email</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Rol</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{u.name || '-'}</td>
              <td style={{ padding: 8 }}>{u.email || '-'}</td>
              <td style={{ padding: 8 }}>{u.role}</td>
              <td style={{ padding: 8 }}>
                <button disabled={savingId === u.id} onClick={() => setRole(u.id, 'admin')}>Hacer admin</button>
                <button disabled={savingId === u.id} onClick={() => setRole(u.id, 'user')} style={{ marginLeft: 8 }}>Hacer user</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
