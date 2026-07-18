'use client'

import { useRef, useState } from 'react'
import { Box, ButtonBase, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { CloudUploadOutlined, InsertDriveFileOutlined } from '@mui/icons-material'
import { AppButton } from '@/components/ui/AppButton'

type FileDropzoneProps = {
  accept?: string
  disabled?: boolean
  file: File | null
  helperText?: string
  label?: string
  maxSizeBytes?: number
  onFileChange: (file: File | null) => void
}

type MultiFileDropzoneProps = {
  accept?: string
  disabled?: boolean
  files: File[]
  helperText?: string
  label?: string
  maxFiles?: number
  maxSizeBytes?: number
  onFilesChange: (files: File[]) => void
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const acceptsFile = (file: File, accept: string) => {
  if (!accept.trim()) return true
  const fileName = file.name.toLocaleLowerCase('es-CL')
  const fileType = file.type.toLocaleLowerCase('es-CL')
  return accept.split(',').map((value) => value.trim().toLocaleLowerCase('es-CL')).some((rule) => {
    if (rule.startsWith('.')) return fileName.endsWith(rule)
    if (rule.endsWith('/*')) return fileType.startsWith(rule.slice(0, -1))
    return fileType === rule
  })
}

export function FileDropzone({
  accept = '',
  disabled = false,
  file,
  helperText,
  label = 'Arrastra y suelta un archivo aquí',
  maxSizeBytes,
  onFileChange,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const selectFile = (candidate?: File) => {
    if (!candidate) return
    if (!acceptsFile(candidate, accept)) {
      setError('El formato del archivo no está permitido.')
      return
    }
    if (maxSizeBytes && candidate.size > maxSizeBytes) {
      setError(`El archivo supera el máximo de ${formatBytes(maxSizeBytes)}.`)
      return
    }
    setError('')
    onFileChange(candidate)
  }

  return (
    <Box>
      <ButtonBase
        component="div"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) event.dataTransfer.dropEffect = 'copy' }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled) selectFile(event.dataTransfer.files[0])
        }}
        sx={(theme) => ({
          width: '100%',
          minHeight: 112,
          p: 2,
          border: `1.5px dashed ${error ? theme.palette.error.main : dragging ? theme.palette.primary.main : theme.palette.grey[400]}`,
          borderRadius: 2,
          bgcolor: dragging ? alpha(theme.palette.primary.main, 0.08) : theme.palette.background.paper,
          color: disabled ? theme.palette.text.disabled : theme.palette.text.primary,
          transition: theme.transitions.create(['border-color', 'background-color']),
          '&:hover': {
            borderColor: disabled ? theme.palette.grey[300] : theme.palette.info.main,
            bgcolor: disabled ? theme.palette.grey[100] : alpha(theme.palette.info.main, 0.04),
          },
          '&.Mui-focusVisible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        })}
      >
        <input
          ref={inputRef}
          hidden
          type="file"
          accept={accept}
          disabled={disabled}
          onClick={(event) => { event.currentTarget.value = '' }}
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          {file ? <InsertDriveFileOutlined color="primary" /> : <CloudUploadOutlined color="primary" />}
          <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
            {file ? file.name : label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {file ? `${formatBytes(file.size)} · Haz clic o arrastra otro archivo para reemplazarlo` : 'o haz clic para buscarlo en tu equipo'}
          </Typography>
          {helperText && !file && <Typography variant="caption" color="text.secondary">{helperText}</Typography>}
        </Box>
      </ButtonBase>
      {file && !disabled && <AppButton color="error" size="small" onClick={() => { setError(''); onFileChange(null) }} sx={{ mt: 0.5 }}>Quitar archivo</AppButton>}
      {error && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography>}
    </Box>
  )
}

export function MultiFileDropzone({
  accept = '',
  disabled = false,
  files,
  helperText,
  label = 'Arrastra y suelta archivos aquí',
  maxFiles,
  maxSizeBytes,
  onFilesChange,
}: MultiFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const selectFiles = (candidates: File[]) => {
    if (!candidates.length) return
    if (candidates.some((file) => !acceptsFile(file, accept))) return setError('Uno o más archivos tienen un formato no permitido.')
    if (maxSizeBytes && candidates.some((file) => file.size > maxSizeBytes)) return setError(`Uno o más archivos superan el máximo de ${formatBytes(maxSizeBytes)}.`)
    const selected = maxFiles ? candidates.slice(0, maxFiles) : candidates
    setError(maxFiles && candidates.length > maxFiles ? `Puedes seleccionar un máximo de ${maxFiles} archivos.` : '')
    onFilesChange(selected)
  }

  return (
    <Box>
      <ButtonBase
        component="div"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) event.dataTransfer.dropEffect = 'copy' }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled) selectFiles(Array.from(event.dataTransfer.files))
        }}
        sx={(theme) => ({
          width: '100%', minHeight: 112, p: 2, borderRadius: 2,
          border: `1.5px dashed ${error ? theme.palette.error.main : dragging ? theme.palette.primary.main : theme.palette.grey[400]}`,
          bgcolor: dragging ? alpha(theme.palette.primary.main, 0.08) : theme.palette.background.paper,
          transition: theme.transitions.create(['border-color', 'background-color']),
          '&:hover': { borderColor: disabled ? theme.palette.grey[300] : theme.palette.info.main, bgcolor: disabled ? theme.palette.grey[100] : alpha(theme.palette.info.main, 0.04) },
          '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
        })}
      >
        <input ref={inputRef} hidden multiple type="file" accept={accept} disabled={disabled} onClick={(event) => { event.currentTarget.value = '' }} onChange={(event) => selectFiles(Array.from(event.target.files || []))} />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          {files.length ? <InsertDriveFileOutlined color="primary" /> : <CloudUploadOutlined color="primary" />}
          <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'center', overflowWrap: 'anywhere' }}>{files.length ? `${files.length} archivo(s): ${files.map((file) => file.name).join(', ')}` : label}</Typography>
          <Typography variant="caption" color="text.secondary">{files.length ? 'Haz clic o arrastra nuevamente para reemplazar la selección' : 'o haz clic para buscarlos en tu equipo'}</Typography>
          {helperText && !files.length && <Typography variant="caption" color="text.secondary">{helperText}</Typography>}
        </Box>
      </ButtonBase>
      {files.length > 0 && !disabled && <AppButton color="error" size="small" onClick={() => { setError(''); onFilesChange([]) }} sx={{ mt: 0.5 }}>Quitar archivos</AppButton>}
      {error && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography>}
    </Box>
  )
}
