'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Typography
} from '@mui/material'
import { Image as ImageIcon, RefreshCw, Star, Trash2, Upload } from 'lucide-react'
import { useSession } from 'next-auth/react'
import UserHeader from '../../../components/layout/UserHeader'
import { colors } from '../../../theme/theme'

type CompanyAsset = {
  id: string
  asset_type: string
  usage_context?: string | null
  name: string
  description?: string | null
  bucket?: string | null
  r2_key: string
  content_type?: string | null
  file_size_bytes?: number | null
  width_px?: number | null
  height_px?: number | null
  is_default?: boolean
  created_at?: string | null
}

type SnackbarState = {
  open: boolean
  message: string
  severity: 'success' | 'error' | 'info' | 'warning'
}

const ASSET_TYPES = [
  { value: 'email_logo', label: 'Correo' },
  { value: 'field_report_logo', label: 'Reporte terreno' },
  { value: 'daily_report_logo', label: 'Reporte diario' },
  { value: 'attendance_logo', label: 'Asistencia' },
  { value: 'presentation_logo', label: 'Presentaciones' },
  { value: 'report_logo', label: 'Reportes general' },
  { value: 'cover_background', label: 'Fondos' }
]

const USAGE_CONTEXTS = [
  { value: 'general', label: 'General' },
  { value: 'excel_v2', label: 'Excel V2' },
  { value: 'excel_consolidated', label: 'Excel consolidado' },
  { value: 'ppt', label: 'Presentación' }
]

const formatBytes = (value?: number | null) => {
  const bytes = Number(value || 0)
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const getImageSize = (file: File) => new Promise<{ width: number; height: number }>((resolve) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 })
    URL.revokeObjectURL(url)
  }
  image.onerror = () => {
    resolve({ width: 0, height: 0 })
    URL.revokeObjectURL(url)
  }
  image.src = url
})

export default function SettingsPage() {
  const { data: session } = useSession()
  const [assets, setAssets] = useState<CompanyAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState('')
  const [selectedContextByType, setSelectedContextByType] = useState<Record<string, string>>({})
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'info' })
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({})

  const role = String((session?.user as any)?.role || '').toLowerCase()
  const canManage = role === 'admin' || role === 'dev'

  const showSnackbar = (message: string, severity: SnackbarState['severity'] = 'info') => {
    setSnackbar({ open: true, message, severity })
  }

  const loadAssets = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/company-assets', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar las imagenes corporativas')
      setAssets(Array.isArray(json?.assets) ? json.assets : [])
    } catch (error) {
      showSnackbar(String((error as Error)?.message || error), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAssets()
  }, [])

  const assetsByType = useMemo(() => {
    const map = new Map<string, CompanyAsset[]>()
    ASSET_TYPES.forEach((type) => map.set(type.value, []))
    assets.forEach((asset) => {
      const list = map.get(asset.asset_type) || []
      list.push(asset)
      map.set(asset.asset_type, list)
    })
    return map
  }, [assets])

  const uploadAsset = async (assetType: string, file: File) => {
    const usageContext = selectedContextByType[assetType] || 'general'
    const uploadKey = `${assetType}:${usageContext}`
    try {
      setUploadingKey(uploadKey)
      const size = await getImageSize(file)
      const presignRes = await fetch('/api/company-assets/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          assetType,
          usageContext
        })
      })
      const presign = await presignRes.json().catch(() => ({}))
      if (!presignRes.ok) throw new Error(presign?.error || 'No se pudo preparar la subida')

      const uploadRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      })
      if (!uploadRes.ok) throw new Error('No se pudo subir la imagen a R2')

      const saveRes = await fetch('/api/company-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_type: assetType,
          usage_context: usageContext,
          name: file.name,
          bucket: presign.bucket,
          r2_key: presign.key,
          content_type: file.type || null,
          file_size_bytes: file.size,
          width_px: size.width || null,
          height_px: size.height || null,
          is_default: true
        })
      })
      const saved = await saveRes.json().catch(() => ({}))
      if (!saveRes.ok) throw new Error(saved?.error || 'No se pudo guardar la imagen')

      showSnackbar('Imagen corporativa guardada', 'success')
      await loadAssets()
    } catch (error) {
      showSnackbar(String((error as Error)?.message || error), 'error')
    } finally {
      setUploadingKey('')
    }
  }

  const handleFileChange = async (assetType: string, file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showSnackbar('Solo se permiten imagenes', 'warning')
      return
    }
    await uploadAsset(assetType, file)
  }

  const patchAsset = async (id: string, action: 'set_default' | 'deactivate') => {
    try {
      const res = await fetch('/api/company-assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar la imagen')
      showSnackbar(action === 'set_default' ? 'Predeterminado actualizado' : 'Imagen desactivada', 'success')
      await loadAssets()
    } catch (error) {
      showSnackbar(String((error as Error)?.message || error), 'error')
    }
  }

  return (
    <>
      <UserHeader title="Ajustes" />
      <Container
        maxWidth={false}
        disableGutters
        sx={{ width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}
      >
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: { xs: 2, md: 3 }, mb: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="h5" sx={{ color: colors.blue1, fontWeight: 800, mb: 0.75 }}>
                Ajustes
              </Typography>
              <Typography sx={{ color: colors.blue7 }}>
                Configuraciones de empresa y plataforma.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
              onClick={() => void loadAssets()}
              disabled={loading}
            >
              Actualizar
            </Button>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ color: colors.blue1, fontWeight: 800 }}>
                Imágenes corporativas
              </Typography>
              <Typography sx={{ color: colors.blue7, fontSize: 14 }}>
                Assets disponibles para reportes, asistencia y presentaciones.
              </Typography>
            </Box>
            {!canManage ? (
              <Chip label="Solo lectura" size="small" />
            ) : null}
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4 }}>
              <CircularProgress size={22} />
              <Typography sx={{ color: colors.blue7 }}>Cargando imágenes...</Typography>
            </Box>
          ) : (
            <Stack gap={2}>
              {ASSET_TYPES.map((assetType) => {
                const list = assetsByType.get(assetType.value) || []
                const usageContext = selectedContextByType[assetType.value] || 'general'
                const uploadKey = `${assetType.value}:${usageContext}`
                const isUploading = uploadingKey === uploadKey

                return (
                  <Box key={assetType.value} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
                      <Stack direction="row" alignItems="center" gap={1.25}>
                        <Box sx={{ width: 34, height: 34, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: '#eef2f7', color: colors.blue4 }}>
                          <ImageIcon size={18} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontWeight: 800, color: colors.blue1 }}>
                            {assetType.label}
                          </Typography>
                          <Typography sx={{ color: colors.blue7, fontSize: 13 }}>
                            {list.length} archivo{list.length === 1 ? '' : 's'}
                          </Typography>
                        </Box>
                      </Stack>

                      {canManage ? (
                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                          <Select
                            size="small"
                            value={usageContext}
                            onChange={(event) => {
                              setSelectedContextByType((prev) => ({ ...prev, [assetType.value]: String(event.target.value) }))
                            }}
                            sx={{ minWidth: 170 }}
                          >
                            {USAGE_CONTEXTS.map((context) => (
                              <MenuItem key={context.value} value={context.value}>{context.label}</MenuItem>
                            ))}
                          </Select>
                          <input
                            ref={(node) => { fileInputsRef.current[assetType.value] = node }}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null
                              event.target.value = ''
                              void handleFileChange(assetType.value, file)
                            }}
                          />
                          <Button
                            variant="contained"
                            startIcon={isUploading ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />}
                            onClick={() => fileInputsRef.current[assetType.value]?.click()}
                            disabled={Boolean(uploadingKey)}
                          >
                            Subir
                          </Button>
                        </Stack>
                      ) : null}
                    </Stack>

                    {list.length === 0 ? (
                      <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 1, p: 2, color: colors.blue7, fontSize: 14 }}>
                        Sin imágenes registradas.
                      </Box>
                    ) : (
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                        {list.map((asset) => (
                          <Box key={asset.id} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                            <Box sx={{ height: 118, bgcolor: '#f8fafc', display: 'grid', placeItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
                              <Box
                                component="img"
                                src={`/api/company-assets/file?key=${encodeURIComponent(asset.r2_key)}`}
                                alt={asset.name}
                                sx={{ maxWidth: '100%', maxHeight: 104, objectFit: 'contain', p: 1 }}
                              />
                            </Box>
                            <Box sx={{ p: 1.5 }}>
                              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography sx={{ fontWeight: 700, color: colors.blue1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {asset.name}
                                  </Typography>
                                  <Typography sx={{ color: colors.blue7, fontSize: 12 }}>
                                    {asset.usage_context || 'general'} · {formatBytes(asset.file_size_bytes)}
                                  </Typography>
                                  {asset.width_px && asset.height_px ? (
                                    <Typography sx={{ color: colors.blue7, fontSize: 12 }}>
                                      {asset.width_px} x {asset.height_px}px
                                    </Typography>
                                  ) : null}
                                </Box>
                                {asset.is_default ? <Chip label="Default" color="primary" size="small" /> : null}
                              </Stack>

                              {canManage ? (
                                <Stack direction="row" justifyContent="flex-end" gap={0.5} sx={{ mt: 1 }}>
                                  <IconButton
                                    size="small"
                                    title="Marcar predeterminada"
                                    disabled={Boolean(asset.is_default)}
                                    onClick={() => void patchAsset(asset.id, 'set_default')}
                                  >
                                    <Star size={17} />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    title="Desactivar"
                                    onClick={() => void patchAsset(asset.id, 'deactivate')}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Stack>
                              ) : null}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Stack>
          )}
        </Paper>
      </Container>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4500}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
