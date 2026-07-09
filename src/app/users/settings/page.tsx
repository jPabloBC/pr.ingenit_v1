'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
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
  const [activeAssetType, setActiveAssetType] = useState(ASSET_TYPES[0].value)
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

  const activeTypeConfig = ASSET_TYPES.find((type) => type.value === activeAssetType) || ASSET_TYPES[0]
  const activeAssets = assetsByType.get(activeTypeConfig.value) || []
  const activeUsageContext = selectedContextByType[activeTypeConfig.value] || 'general'
  const activeUploadKey = `${activeTypeConfig.value}:${activeUsageContext}`
  const activeIsUploading = uploadingKey === activeUploadKey
  const defaultAssetsCount = assets.filter((asset) => asset.is_default).length

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
        sx={{
          width: '100%',
          maxWidth: '100% !important',
          px: { xs: 2, sm: 3, md: 4 },
          py: 3,
          bgcolor: '#f6f8fb',
          minHeight: 'calc(100vh - 72px)',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            border: '1px solid #d8e2ef',
            borderRadius: 2,
            overflow: 'hidden',
            mb: 2,
          }}
        >
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            alignItems={{ xs: 'stretch', lg: 'center' }}
            justifyContent="space-between"
            gap={2}
            sx={{ px: { xs: 2, md: 3 }, py: 2.25, bgcolor: colors.white }}
          >
            <Box>
              <Typography variant="h5" sx={{ color: colors.blue1, fontWeight: 900, mb: 0.35 }}>
                Ajustes
              </Typography>
              <Typography sx={{ color: colors.gray3, fontSize: 14 }}>
                Administración de identidad visual para correos, reportes y presentaciones.
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.25}>
              {[
                { label: 'Tipos', value: ASSET_TYPES.length },
                { label: 'Archivos', value: assets.length },
                { label: 'Default', value: defaultAssetsCount },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    minWidth: 92,
                    px: 1.4,
                    py: 0.9,
                    border: '1px solid #dbe6f3',
                    borderRadius: 1,
                    bgcolor: '#fbfdff',
                  }}
                >
                  <Typography sx={{ color: colors.blue7, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ color: colors.blue1, fontSize: 20, fontWeight: 900, lineHeight: 1.05 }}>
                    {item.value}
                  </Typography>
                </Box>
              ))}
              <Button
                variant="outlined"
                startIcon={loading ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
                onClick={() => void loadAssets()}
                disabled={loading}
                sx={{ minHeight: 42 }}
              >
                Actualizar
              </Button>
            </Stack>
          </Stack>
        </Paper>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0, 1fr)' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Paper elevation={0} sx={{ border: '1px solid #d8e2ef', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: colors.white, borderBottom: '1px solid #e6edf6' }}>
              <Typography sx={{ color: colors.blue1, fontWeight: 900 }}>
                Imágenes corporativas
              </Typography>
              <Typography sx={{ color: colors.gray4, fontSize: 12.5 }}>
                Selecciona una categoría.
              </Typography>
            </Box>

            <Stack sx={{ p: 1 }}>
              {ASSET_TYPES.map((assetType) => {
                const count = (assetsByType.get(assetType.value) || []).length
                const selected = assetType.value === activeTypeConfig.value
                return (
                  <Button
                    key={assetType.value}
                    fullWidth
                    onClick={() => setActiveAssetType(assetType.value)}
                    sx={{
                      justifyContent: 'flex-start',
                      minHeight: 48,
                      px: 1.25,
                      borderRadius: 1,
                      color: selected ? colors.blue1 : colors.gray2,
                      bgcolor: selected ? '#eaf3ff' : 'transparent',
                      border: selected ? '1px solid #c5dcf7' : '1px solid transparent',
                      '&:hover': { bgcolor: selected ? '#eaf3ff' : '#f3f7fc' },
                    }}
                  >
                    <Stack direction="row" alignItems="center" gap={1.1} sx={{ width: '100%' }}>
                      <Box sx={{
                        width: 30,
                        height: 30,
                        borderRadius: 1,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: selected ? colors.blue6 : '#edf2f7',
                        color: selected ? colors.white : colors.blue5,
                        flexShrink: 0,
                      }}>
                        <ImageIcon size={16} />
                      </Box>
                      <Box sx={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {assetType.label}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: selected ? colors.blue7 : colors.gray5 }}>
                          {count} archivo{count === 1 ? '' : 's'}
                        </Typography>
                      </Box>
                      <Chip label={count} size="small" sx={{ height: 22, minWidth: 30, bgcolor: selected ? colors.white : '#eef2f7', color: colors.blue1, fontWeight: 800 }} />
                    </Stack>
                  </Button>
                )
              })}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ border: '1px solid #d8e2ef', borderRadius: 2, overflow: 'hidden', minWidth: 0 }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              alignItems={{ xs: 'stretch', md: 'center' }}
              justifyContent="space-between"
              gap={1.5}
              sx={{ px: { xs: 2, md: 2.5 }, py: 2, bgcolor: colors.white, borderBottom: '1px solid #e6edf6' }}
            >
              <Stack direction="row" alignItems="center" gap={1.25}>
                <Box sx={{ width: 42, height: 42, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: '#eaf3ff', color: colors.blue5 }}>
                  <ImageIcon size={21} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: colors.blue1, fontWeight: 900, fontSize: 20, lineHeight: 1.15 }}>
                    {activeTypeConfig.label}
                  </Typography>
                  <Typography sx={{ color: colors.gray4, fontSize: 13 }}>
                    {activeAssets.length} archivo{activeAssets.length === 1 ? '' : 's'} disponible{activeAssets.length === 1 ? '' : 's'}
                  </Typography>
                </Box>
              </Stack>

              {canManage ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                  <Select
                    size="small"
                    value={activeUsageContext}
                    onChange={(event) => {
                      setSelectedContextByType((prev) => ({ ...prev, [activeTypeConfig.value]: String(event.target.value) }))
                    }}
                    sx={{ minWidth: { xs: '100%', sm: 190 }, bgcolor: colors.white }}
                  >
                    {USAGE_CONTEXTS.map((context) => (
                      <MenuItem key={context.value} value={context.value}>{context.label}</MenuItem>
                    ))}
                  </Select>
                  <input
                    ref={(node) => { fileInputsRef.current[activeTypeConfig.value] = node }}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null
                      event.target.value = ''
                      void handleFileChange(activeTypeConfig.value, file)
                    }}
                  />
                  <Button
                    variant="contained"
                    startIcon={activeIsUploading ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />}
                    onClick={() => fileInputsRef.current[activeTypeConfig.value]?.click()}
                    disabled={Boolean(uploadingKey)}
                    sx={{ minWidth: 116 }}
                  >
                    Subir
                  </Button>
                </Stack>
              ) : (
                <Chip label="Solo lectura" size="small" />
              )}
            </Stack>

            <Box sx={{ p: { xs: 2, md: 2.5 } }}>
              {loading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 6 }}>
                  <CircularProgress size={22} />
                  <Typography sx={{ color: colors.blue7 }}>Cargando imágenes...</Typography>
                </Box>
              ) : activeAssets.length === 0 ? (
                <Box
                  sx={{
                    minHeight: 280,
                    border: '1px dashed #b9c8dc',
                    borderRadius: 2,
                    bgcolor: '#fbfdff',
                    display: 'grid',
                    placeItems: 'center',
                    textAlign: 'center',
                    px: 2,
                  }}
                >
                  <Box>
                    <Box sx={{ width: 54, height: 54, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: '#edf4fb', color: colors.blue5, mx: 'auto', mb: 1.25 }}>
                      <ImageIcon size={25} />
                    </Box>
                    <Typography sx={{ color: colors.blue1, fontWeight: 900 }}>
                      Sin imágenes registradas
                    </Typography>
                    <Typography sx={{ color: colors.gray4, fontSize: 13 }}>
                      {canManage ? 'Sube un archivo para habilitar esta categoría.' : 'No hay archivos visibles para esta categoría.'}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                  {activeAssets.map((asset) => (
                    <Box
                      key={asset.id}
                      sx={{
                        border: '1px solid #dce5f0',
                        borderRadius: 1,
                        overflow: 'hidden',
                        bgcolor: colors.white,
                        minWidth: 0,
                      }}
                    >
                      <Box sx={{ height: 150, bgcolor: '#f3f6fa', display: 'grid', placeItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                        <Box
                          component="img"
                          src={`/api/company-assets/file?key=${encodeURIComponent(asset.r2_key)}`}
                          alt={asset.name}
                          sx={{ maxWidth: '100%', maxHeight: 130, objectFit: 'contain', p: 1 }}
                        />
                      </Box>
                      <Box sx={{ p: 1.5 }}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 900, color: colors.blue1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {asset.name}
                            </Typography>
                            <Typography sx={{ color: colors.gray4, fontSize: 12 }}>
                              {asset.usage_context || 'general'} · {formatBytes(asset.file_size_bytes)}
                            </Typography>
                            {asset.width_px && asset.height_px ? (
                              <Typography sx={{ color: colors.gray4, fontSize: 12 }}>
                                {asset.width_px} x {asset.height_px}px
                              </Typography>
                            ) : null}
                          </Box>
                          {asset.is_default ? <Chip label="Default" size="small" sx={{ bgcolor: '#dceaf7', color: colors.blue1, fontWeight: 800 }} /> : null}
                        </Stack>

                        {canManage ? (
                          <>
                            <Divider sx={{ my: 1.1 }} />
                            <Stack direction="row" justifyContent="flex-end" gap={0.5}>
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
                          </>
                        ) : null}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
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
