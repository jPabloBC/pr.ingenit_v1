"use client"

import React, { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Box, Typography, Button, List, ListItem, ListItemText, CircularProgress } from '@mui/material'
import { colors } from '../../../theme/theme'

export default function DevCompaniesPage() {
	const { data: session, status } = useSession()
	const router = useRouter()
	const [companies, setCompanies] = useState<any[]>([])
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		if (status === 'unauthenticated') {
			router.push('/dev/signin')
		}
	}, [status, router])

	useEffect(() => {
		if (!session || String(session.user?.role) !== 'dev') return
		setLoading(true)
		fetch('/api/dev/companies')
			.then(r => r.json())
			.then(j => setCompanies(j.companies || []))
			.catch(err => console.error(err))
			.finally(() => setLoading(false))
	}, [session])

	if (status === 'loading' || loading) {
		return (
			<Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
				<CircularProgress />
			</Box>
		)
	}

	if (!session) return null
	if (String(session.user?.role) !== 'dev') return (
		<Box sx={{ p: 4 }}>
			<Typography variant="h5">Acceso restringido</Typography>
		</Box>
	)

	return (
		<Box>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
				<Typography variant="h4">Companies</Typography>
				<Button variant="contained" onClick={() => router.push('/dev')}>Volver</Button>
			</Box>

			{companies.length === 0 ? (
				<Typography>No hay empresas registradas</Typography>
			) : (
				<List>
					{companies.map(c => (
						<ListItem key={c.id} secondaryAction={<Button onClick={() => router.push(`/dev/companies/${c.id}`)}>Abrir</Button>}>
							<ListItemText primary={c.name || c.id} />
						</ListItem>
					))}
				</List>
			)}
		</Box>
	)
}

