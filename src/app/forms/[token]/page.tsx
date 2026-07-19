'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Box, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, FormGroup, FormLabel, IconButton, Paper, Radio, RadioGroup, Stack, Typography } from '@mui/material'
import { BusinessOutlined, CloseOutlined, DownloadOutlined, DrawOutlined, OpenInNewOutlined, SendOutlined } from '@mui/icons-material'
import { formatCommunicationFormRut, validateCommunicationFormAnswers, validateCommunicationFormIdentity, type CommunicationFormIdentity, type CommunicationFormQuestion } from '@/lib/communicationForms'
import { colors } from '@/theme/theme'
import { SignaturePad } from '@/components/ui/SignaturePad'
import { AppAlert } from '@/components/ui/AppAlert'
import { AppButton } from '@/components/ui/AppButton'
import { AppTextField } from '@/components/ui/FormControls'
import { AppCheckbox } from '@/components/ui/InteractiveControls'

type PublicResult = { id: string; title: string; description: string; file_name: string; content_type: string; file_url: string }
type PublicPayload = {
  company: { name: string; logo_url?: string | null }
  form: { id: string; title: string; description: string; questions: CommunicationFormQuestion[] }
  invitation: { recipient_name: string; status: 'pending' | 'completed'; submitted_at?: string | null }
  identity: CommunicationFormIdentity
  result: PublicResult | null
}

export default function PublicCommunicationFormPage() {
  const params = useParams() as { token?: string }
  const token = String(params?.token || '')
  const [payload, setPayload] = useState<PublicPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [identity, setIdentity] = useState<CommunicationFormIdentity>({ first_names: '', last_names: '', rut: '', position: '', shift: '' })
  const [signature, setSignature] = useState('')
  const [signatureDraft, setSignatureDraft] = useState('')
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false)
  const [signatureError, setSignatureError] = useState('')
  const [logoFailed, setLogoFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/public/communication-forms/${token}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'No fue posible abrir el formulario.')
      setPayload(data)
      setLogoFailed(false)
      if (data?.identity) setIdentity(data.identity)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const submit = async () => {
    setError('')
    let validatedIdentity: CommunicationFormIdentity
    let validatedAnswers: Record<string, string | string[]>
    try {
      validatedIdentity = validateCommunicationFormIdentity(identity)
      validatedAnswers = validateCommunicationFormAnswers(payload?.form.questions || [], answers)
      setIdentity(validatedIdentity)
      setAnswers(validatedAnswers)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : String(validationError))
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (!signature) {
      setSignatureError('Necesitas registrar tu firma antes de enviar el formulario.')
      setSignatureDraft('')
      setSignatureDialogOpen(true)
      return
    }
    setSignatureError('')
    setSubmitting(true)
    try {
      const response = await fetch(`/api/public/communication-forms/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: validatedIdentity, answers: validatedAnswers, signature }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'No fue posible guardar las respuestas.')
      setPayload((current) => current ? { ...current, invitation: data.invitation || { ...current.invitation, status: 'completed' }, result: data.result } : current)
      if (data?.response_token && typeof window !== 'undefined') window.history.replaceState(null, '', `/forms/${data.response_token}`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const openSignatureDialog = () => {
    setError('')
    try {
      const validatedIdentity = validateCommunicationFormIdentity(identity)
      const validatedAnswers = validateCommunicationFormAnswers(payload?.form.questions || [], answers)
      setIdentity(validatedIdentity)
      setAnswers(validatedAnswers)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : String(validationError))
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSignatureDraft(signature)
    setSignatureDialogOpen(true)
  }

  const confirmSignature = () => {
    if (!signatureDraft) return
    setSignature(signatureDraft)
    setSignatureError('')
    setSignatureDialogOpen(false)
  }

  const renderResult = (result: PublicResult) => {
    if (result.content_type.startsWith('video/')) return <Box component="video" controls src={result.file_url} sx={{ width: '100%', maxHeight: '70vh', bgcolor: colors.black, borderRadius: 1 }} />
    if (result.content_type.startsWith('audio/')) return <Box component="audio" controls src={result.file_url} sx={{ width: '100%' }} />
    if (result.content_type === 'application/pdf') return <Box component="iframe" title={result.file_name} src={result.file_url} sx={{ width: '100%', height: '70vh', border: `1px solid ${colors.managementBorder}`, borderRadius: 1 }} />
    return <AppButton href={result.file_url} startIcon={<DownloadOutlined />} variant="contained">Descargar {result.file_name}</AppButton>
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: colors.managementPageBg, py: { xs: 0, sm: 2, md: 5 } }}>
      <Container maxWidth="md" disableGutters sx={{ px: { xs: 0, sm: 2 } }}>
        <Paper
          elevation={0}
          sx={{
            minHeight: { xs: '100dvh', sm: 'auto' },
            border: { xs: 'none', sm: `1px solid ${colors.managementBorder}` },
            borderRadius: { xs: 0, sm: 2 },
            overflow: 'hidden',
          }}
        >
          <Box sx={{ bgcolor: colors.blue1, color: colors.white, px: { xs: 1.5, sm: 2, md: 4 }, py: { xs: 1, sm: 1.5 } }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              {payload?.company.logo_url && !logoFailed ? (
                <Box sx={{ width: 54, height: 54, display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: 'rgba(255, 255, 255, 0.5)', borderRadius: 1, p: 0.25 }}>
                  <Box component="img" src={payload.company.logo_url} alt={`Logo de ${payload.company.name}`} onError={() => setLogoFailed(true)} sx={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </Box>
              ) : <BusinessOutlined sx={{ fontSize: 34, color: colors.white }} />}
              <Typography variant="h6" sx={{ color: 'inherit', fontWeight: 700 }}>{payload?.company.name || 'Empresa'}</Typography>
            </Stack>
          </Box>
          <Box sx={{ p: { xs: 1.5, sm: 2, md: 4 } }}>
            {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : error && !payload ? <AppAlert severity="error">{error}</AppAlert> : payload ? (
              <Stack spacing={{ xs: 2, sm: 3 }}>
                <Box>
                  <Typography variant="h4" sx={{ color: colors.blue3, fontWeight: 700 }}>{payload.form.title}</Typography>
                  <Typography sx={{ mt: 1, color: colors.gray4 }}>{payload.form.description}</Typography>
                  {payload.invitation.recipient_name && <Typography variant="body2" sx={{ mt: 1, color: colors.blue7 }}>Respuesta de {payload.invitation.recipient_name}</Typography>}
                </Box>
                {error && <AppAlert severity="error">{error}</AppAlert>}
                {payload.invitation.status === 'completed' && payload.result ? (
                  <Stack spacing={2}>
                    <AppAlert severity="success">Formulario completado.</AppAlert>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: colors.blue3 }}>{payload.result.title}</Typography>
                      {payload.result.description && <Typography sx={{ mt: 0.75, color: colors.gray4 }}>{payload.result.description}</Typography>}
                    </Box>
                    {renderResult(payload.result)}
                    <Box component="a" href={payload.result.file_url} target="_blank" rel="noreferrer" sx={{ display: 'inline-flex', alignSelf: 'flex-start', textDecoration: 'none' }}>
                      <AppButton component="span" startIcon={<OpenInNewOutlined />}>Abrir en otra ventana</AppButton>
                    </Box>
                  </Stack>
                ) : (
                  <Stack spacing={{ xs: 2, sm: 3 }}>
                    <Box>
                      <Typography variant="h6" sx={{ color: colors.blue3, fontWeight: 700, mb: 0.5 }}>Datos del colaborador</Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 1.25, sm: 2 } }}>
                      <AppTextField required label="Nombres" autoComplete="given-name" value={identity.first_names} inputProps={{ style: { textTransform: 'uppercase' } }} onChange={(event) => setIdentity((current) => ({ ...current, first_names: event.target.value.toLocaleUpperCase('es-CL') }))} />
                      <AppTextField required label="Apellidos" autoComplete="family-name" value={identity.last_names} inputProps={{ style: { textTransform: 'uppercase' } }} onChange={(event) => setIdentity((current) => ({ ...current, last_names: event.target.value.toLocaleUpperCase('es-CL') }))} />
                      <AppTextField required label="RUT" placeholder="12.345.678-5" value={identity.rut} inputProps={{ style: { textTransform: 'uppercase' } }} onChange={(event) => setIdentity((current) => ({ ...current, rut: event.target.value.toLocaleUpperCase('es-CL') }))} onBlur={() => setIdentity((current) => ({ ...current, rut: formatCommunicationFormRut(current.rut) }))} />
                      <AppTextField required label="Cargo" value={identity.position} inputProps={{ style: { textTransform: 'uppercase' } }} onChange={(event) => setIdentity((current) => ({ ...current, position: event.target.value.toLocaleUpperCase('es-CL') }))} />
                      <AppTextField required label="Turno" value={identity.shift} inputProps={{ style: { textTransform: 'uppercase' } }} onChange={(event) => setIdentity((current) => ({ ...current, shift: event.target.value.toLocaleUpperCase('es-CL') }))} />
                    </Box>
                    <Typography variant="caption" sx={{ color: colors.gray4, mt: -1 }}>
                      * Datos requeridos
                    </Typography>
                    {payload.form.questions.length > 0 && <Divider />}
                    {payload.form.questions.map((question) => (
                      <FormControl key={question.id} required={question.required} fullWidth>
                        <FormLabel sx={{ mb: 1, color: colors.blue3, fontWeight: 700 }}>{question.prompt}{!question.required ? ' (opcional)' : ''}</FormLabel>
                        {question.type === 'text' ? (
                          <AppTextField multiline minRows={3} value={String(answers[question.id] || '')} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
                        ) : question.type === 'multiple_choice' ? (
                          <FormGroup>
                            {question.options.map((option) => {
                              const selected = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : []
                              return <FormControlLabel key={option} label={option} control={<AppCheckbox checked={selected.includes(option)} onChange={() => setAnswers((current) => ({ ...current, [question.id]: selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option] }))} />} />
                            })}
                          </FormGroup>
                        ) : (
                          <RadioGroup value={String(answers[question.id] || '')} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}>
                            {question.options.map((option) => <FormControlLabel key={option} value={option} control={<Radio />} label={option} />)}
                          </RadioGroup>
                        )}
                      </FormControl>
                    ))}
                    <Divider />
                    <Box>
                      <Typography variant="h6" sx={{ color: colors.blue3, fontWeight: 700, mb: 0.5 }}>Firma del colaborador</Typography>
                      <Typography variant="body2" sx={{ color: colors.gray4, mb: 1.5 }}>Abre el espacio de firma y utiliza el dedo, mouse o lápiz.</Typography>
                      {signature && (
                        <Box
                          component="img"
                          src={signature}
                          alt="Vista previa de la firma registrada"
                          sx={{ display: 'block', width: '100%', height: 110, objectFit: 'contain', border: `1px solid ${colors.managementBorder}`, borderRadius: 1, bgcolor: colors.white, mb: 1.5 }}
                        />
                      )}
                      <AppButton
                        variant={signature ? 'outlined' : 'contained'}
                        size="large"
                        startIcon={<DrawOutlined />}
                        onClick={openSignatureDialog}
                        disabled={submitting}
                        fullWidth
                      >
                        {signature ? 'Volver a firmar' : 'Firmar'}
                      </AppButton>
                      {signatureError && <AppAlert severity="warning" sx={{ mt: 1.5 }}>{signatureError}</AppAlert>}
                    </Box>
                    <AppButton variant="contained" size="large" startIcon={<SendOutlined />} onClick={() => void submit()} disabled={submitting}>{submitting ? 'Procesando...' : 'Enviar y ver resultado'}</AppButton>
                  </Stack>
                )}
              </Stack>
            ) : null}
          </Box>
        </Paper>
      </Container>
      <Dialog
        fullScreen
        open={signatureDialogOpen}
        onClose={() => setSignatureDialogOpen(false)}
        aria-labelledby="signature-dialog-title"
      >
        <DialogTitle
          id="signature-dialog-title"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            color: colors.blue3,
            fontWeight: 700,
            px: { xs: 1.5, sm: 2.5 },
            py: { xs: 1, sm: 1.25 },
            '@media (orientation: landscape)': { py: 0.5 },
          }}
        >
          Firma del colaborador
          <IconButton aria-label="Cerrar firma" onClick={() => setSignatureDialogOpen(false)}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            p: { xs: 1, sm: 1.5 },
            overflow: 'hidden',
            '@media (orientation: landscape)': { p: 0.75 },
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: colors.gray4,
              mb: 1,
              '@media (orientation: landscape) and (max-height: 700px)': { display: 'none' },
            }}
          >
            Firma utilizando el espacio disponible en la pantalla.
          </Typography>
          {signatureDialogOpen && (
            <SignaturePad
              fullScreen
              initialValue={signature}
              disabled={submitting}
              onChange={setSignatureDraft}
            />
          )}
        </DialogContent>
        <DialogActions
          sx={{
            px: { xs: 1, sm: 2 },
            py: { xs: 0.75, sm: 1 },
            gap: 1,
            '@media (orientation: landscape)': {
              py: 0.5,
              '& .MuiButton-root': { minHeight: 36 },
            },
          }}
        >
          <AppButton variant="outlined" onClick={() => setSignatureDialogOpen(false)} disabled={submitting}>
            Cancelar
          </AppButton>
          <AppButton variant="contained" onClick={confirmSignature} disabled={submitting || !signatureDraft}>
            Confirmar firma
          </AppButton>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
