'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Grid, 
  Card, 
  CardContent,
  TextField,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Avatar,
  InputAdornment,
  MenuItem
} from '@mui/material'
import { 
  Business, 
  Person, 
  Email, 
  Phone, 
  LocationOn, 
  Save,
  Edit,
  Cancel
} from '@mui/icons-material'
import { colors } from '@/theme/theme'
import DashboardLayout from '@/components/layout/dashboard-layout'

interface CompanyData {
  id: string
  name: string
  rut: string
  address: string
  phone: string
  email: string
  industry: string
  country: string
  website?: string
  description?: string
}

interface AdminData {
  id: string
  email: string
  name: string
  role: string
  company_id: string
}

export default function CompaniesPage() {
  const { data: session } = useSession()
  const [companyData, setCompanyData] = useState<CompanyData | null>(null)
  const [adminData, setAdminData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Industrias disponibles
  const industries = [
    'Minería',
    'Construcción',
    'Manufactura',
    'Servicios',
    'Tecnología',
    'Salud',
    'Educación',
    'Retail',
    'Otro'
  ]

  // Países disponibles
  const countries = [
    { code: 'CL', name: 'Chile' },
    { code: 'AR', name: 'Argentina' },
    { code: 'PE', name: 'Perú' },
    { code: 'CO', name: 'Colombia' },
    { code: 'MX', name: 'México' },
    { code: 'US', name: 'Estados Unidos' },
    { code: 'BR', name: 'Brasil' },
    { code: 'ES', name: 'España' }
  ]

  useEffect(() => {
    if (session?.user?.companyId) {
      fetchCompanyData()
      fetchAdminData()
    }
  }, [session])

  const fetchCompanyData = async () => {
    try {
      const response = await fetch(`/api/companies/${session?.user?.companyId}`)
      if (response.ok) {
        const data = await response.json()
        setCompanyData(data)
      } else {
        setError('Error al cargar datos de la empresa')
      }
    } catch (error) {
      setError('Error de conexión')
    }
  }

  const fetchAdminData = async () => {
    try {
      const response = await fetch('/api/users/profile')
      if (response.ok) {
        const data = await response.json()
        setAdminData(data)
      }
    } catch (error) {
      console.error('Error al cargar datos del administrador:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/companies/${companyData?.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(companyData)
      })

      if (response.ok) {
        setSuccess('Datos actualizados exitosamente')
        setEditing(false)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Error al actualizar datos')
      }
    } catch (error) {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    fetchCompanyData() // Recargar datos originales
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Container maxWidth="xl">
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
            <CircularProgress />
          </Box>
        </Container>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Container maxWidth="xl">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ color: colors.blue1, fontWeight: 700 }}>
            Gestión de Empresa
          </Typography>
          <Typography variant="body1" sx={{ color: colors.blue7 }}>
            Administra la información de la empresa y del administrador
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Información de la Empresa */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
                  <Box display="flex" alignItems="center">
                    <Business sx={{ color: colors.blue6, mr: 2 }} />
                    <Typography variant="h6" sx={{ color: colors.blue1 }}>
                      Información de la Empresa
                    </Typography>
                  </Box>
                  {!editing && (
                    <Button
                      startIcon={<Edit />}
                      onClick={() => setEditing(true)}
                      variant="outlined"
                      sx={{ textTransform: 'none' }}
                    >
                      Editar
                    </Button>
                  )}
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Nombre de la Empresa"
                      value={companyData?.name || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, name: e.target.value } : null)}
                      disabled={!editing}
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><Business /></InputAdornment>
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="RUT de la Empresa"
                      value={companyData?.rut || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, rut: e.target.value } : null)}
                      disabled={!editing}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Dirección"
                      value={companyData?.address || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, address: e.target.value } : null)}
                      disabled={!editing}
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><LocationOn /></InputAdornment>
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Teléfono"
                      value={companyData?.phone || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, phone: e.target.value } : null)}
                      disabled={!editing}
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><Phone /></InputAdornment>
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Email de la Empresa"
                      value={companyData?.email || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, email: e.target.value } : null)}
                      disabled={!editing}
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><Email /></InputAdornment>
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      select
                      label="Industria"
                      value={companyData?.industry || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, industry: e.target.value } : null)}
                      disabled={!editing}
                    >
                      {industries.map((industry) => (
                        <MenuItem key={industry} value={industry}>
                          {industry}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      select
                      label="País"
                      value={companyData?.country || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, country: e.target.value } : null)}
                      disabled={!editing}
                    >
                      {countries.map((country) => (
                        <MenuItem key={country.code} value={country.code}>
                          {country.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Sitio Web"
                      value={companyData?.website || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, website: e.target.value } : null)}
                      disabled={!editing}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="Descripción de la Empresa"
                      value={companyData?.description || ''}
                      onChange={(e) => setCompanyData(prev => prev ? { ...prev, description: e.target.value } : null)}
                      disabled={!editing}
                    />
                  </Grid>
                </Grid>

                {editing && (
                  <Box display="flex" gap={2} mt={3}>
                    <Button
                      startIcon={<Save />}
                      onClick={handleSave}
                      variant="contained"
                      disabled={saving}
                      sx={{ textTransform: 'none' }}
                    >
                      {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </Button>
                    <Button
                      startIcon={<Cancel />}
                      onClick={handleCancel}
                      variant="outlined"
                      disabled={saving}
                      sx={{ textTransform: 'none' }}
                    >
                      Cancelar
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Información del Administrador */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={3}>
                  <Person sx={{ color: colors.blue6, mr: 2 }} />
                  <Typography variant="h6" sx={{ color: colors.blue1 }}>
                    Administrador
                  </Typography>
                </Box>

                <Box display="flex" flexDirection="column" alignItems="center" mb={3}>
                  <Avatar sx={{ width: 80, height: 80, mb: 2, bgcolor: colors.blue6 }}>
                    {adminData?.name?.charAt(0) || 'A'}
                  </Avatar>
                  <Typography variant="h6" sx={{ color: colors.blue1, textAlign: 'center' }}>
                    {adminData?.name || 'Administrador'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.blue7, textAlign: 'center' }}>
                    {adminData?.email || 'admin@empresa.com'}
                  </Typography>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box>
                  <Typography variant="body2" sx={{ color: colors.blue7, mb: 1 }}>
                    <strong>Rol:</strong> {adminData?.role || 'Administrador'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.blue7, mb: 1 }}>
                    <strong>Empresa:</strong> {companyData?.name || 'Sin asignar'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.blue7 }}>
                    <strong>ID de Usuario:</strong> {adminData?.id || 'N/A'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </DashboardLayout>
  )
}