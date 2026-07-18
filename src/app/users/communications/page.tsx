'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { Close, ContentCopyOutlined, EmailOutlined, ManageAccountsOutlined, SendOutlined, ShareOutlined, WhatsApp } from '@mui/icons-material'
import { CircleArrowLeft, CircleArrowRight, MailX, MessageCircleOff } from 'lucide-react'
import UserHeader from '@/components/layout/UserHeader'
import ConditionalFormsPanel from '@/components/communications/ConditionalFormsPanel'
import { useAppSnackbar } from '@/components/ui/AppSnackbarProvider'
import { AppTabs } from '@/components/ui/AppTabs'
import { AppButton } from '@/components/ui/AppButton'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { AppSearchField, AppTextField } from '@/components/ui/FormControls'
import { AppCheckbox, AppIconButton, AppToggleButton } from '@/components/ui/InteractiveControls'
import { colors } from '@/theme/theme'

type Collaborator = { id: string; name: string; document: string; position: string; specialty: string; workerType: string; attendanceStatus: string; shift: string; phone: string; email: string }
type Campaign = { id: string; title: string; message: string; created_at: string; channels: string[]; attachment_name?: string | null }
type Delivery = { id: string; channel: string; recipient_name: string; recipient_email?: string | null; recipient_phone?: string | null; status: string; error_message?: string | null; whatsapp_url?: string | null; attachment_url?: string | null }

const MAX_CAMPAIGN_RECIPIENTS = 300
const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
const formatPosition = (value: string) => value
  .trim()
  .toLocaleLowerCase('es-CL')
  .replace(/\bcaneria\b/g, 'cañería')
  .split(/\s+/)
  .map((word) => `${word.charAt(0).toLocaleUpperCase('es-CL')}${word.slice(1)}`)
  .join(' ')
const normalizeSearch = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-CL')

const MoveRightHoverIcon = () => <svg className="move-filled" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l.324 .005a10 10 0 1 1 -.648 0l.324 -.005zm.613 5.21a1 1 0 0 0 -1.32 1.497l2.291 2.293h-5.584l-.117 .007a1 1 0 0 0 .117 1.993h5.584l-2.291 2.293l-.083 .094a1 1 0 0 0 1.497 1.32l4 -4l.073 -.082l.064 -.089l.062 -.113l.044 -.11l.03 -.112l.017 -.126l.003 -.075l-.007 -.118l-.029 -.148l-.035 -.105l-.054 -.113l-.071 -.111a1.008 1.008 0 0 0 -.097 -.112l-4 -4z" /></svg>
const MoveLeftHoverIcon = () => <svg className="move-filled" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 1 .324 19.995l-.324 .005l-.324 -.005a10 10 0 0 1 .324 -19.995zm.707 5.293a1 1 0 0 0 -1.414 0l-4 4a1.048 1.048 0 0 0 -.083 .094l-.064 .092l-.052 .098l-.044 .11l-.03 .112l-.017 .126l-.003 .075l.004 .09l.007 .058l.025 .118l.035 .105l.054 .113l.043 .07l.071 .095l.054 .058l4 4l.094 .083a1 1 0 0 0 1.32 -1.497l-2.292 -2.293h5.585l.117 -.007a1 1 0 0 0 -.117 -1.993h-5.586l2.293 -2.293l.083 -.094a1 1 0 0 0 -.083 -1.32z" /></svg>
const MoveIcon = ({ direction }: { direction: 'left' | 'right' }) => <Box component="span" sx={{ display: 'inline-flex', color: '#607d8b', '& .move-filled': { display: 'none' } }} className="move-icon">{direction === 'right' ? <CircleArrowRight className="move-outline" size={18} strokeWidth={1.25} /> : <CircleArrowLeft className="move-outline" size={18} strokeWidth={1.25} />}{direction === 'right' ? <MoveRightHoverIcon /> : <MoveLeftHoverIcon />}</Box>
const SendTabIcon = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14l11 -11" /><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" /></svg>
const FormTabIcon = () => <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /><path d="M9 12h6" /><path d="M9 16h6" /></svg>

export default function CommunicationsPage() {
  const { notify } = useAppSnackbar()
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [positionSearch, setPositionSearch] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedPositions, setSelectedPositions] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [channels, setChannels] = useState<string[]>(['email', 'whatsapp'])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [canSend, setCanSend] = useState(false)
  const [canManageForms, setCanManageForms] = useState(false)
  const [attendanceDate, setAttendanceDate] = useState('')
  const [detail, setDetail] = useState<{ campaign: Campaign & { attachment_url?: string | null }; deliveries: Delivery[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'send' | 'forms'>('send')
  const showToast = useCallback((toast: { type: 'success' | 'error' | 'info'; text: string }) => notify(toast.text, { severity: toast.type }), [notify])

  const selectTab = useCallback((nextTab: 'send' | 'forms', replaceUrl = true) => {
    setActiveTab(nextTab)
    if (!replaceUrl || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', nextTab)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/communications', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'No fue posible cargar Comunicaciones.')
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : [])
      setPositions(Array.isArray(data.positions) ? data.positions : [])
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : [])
      setAttendanceDate(String(data?.attendance_date || ''))
      const sendAllowed = Boolean(data?.capabilities?.can_send)
      const formsAllowed = Boolean(data?.capabilities?.can_manage_forms)
      setCanSend(sendAllowed)
      setCanManageForms(formsAllowed)
      const requestedTab = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('tab')
        : null
      const resolvedTab: 'send' | 'forms' = requestedTab === 'forms' && formsAllowed
        ? 'forms'
        : requestedTab === 'send' && sendAllowed
          ? 'send'
          : sendAllowed
            ? 'send'
            : 'forms'
      selectTab(resolvedTab)
    } catch (error) {
      showToast({ type: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setLoading(false)
    }
  }, [selectTab, showToast])

  useEffect(() => { void load() }, [load])

  const filteredCollaborators = useMemo(() => collaborators.filter((person) => selectedPositions.includes(person.position)), [collaborators, selectedPositions])
  const selectedCollaborators = useMemo(() => filteredCollaborators.filter((person) => selectedIds.includes(person.id)), [filteredCollaborators, selectedIds])
  const contactSummary = useMemo(() => ({
    email: selectedCollaborators.filter((person) => Boolean(person.email)).length,
    whatsapp: selectedCollaborators.filter((person) => Boolean(person.phone)).length,
  }), [selectedCollaborators])
  const searchTerm = useMemo(() => normalizeSearch(positionSearch), [positionSearch])
  const matchesCollaboratorSearch = useCallback((person: Collaborator) => !searchTerm || [person.name, person.position, person.email, person.phone].some((value) => normalizeSearch(value).includes(searchTerm)), [searchTerm])
  const matchingPositions = useMemo(() => positions.filter((position) => !searchTerm || normalizeSearch(position).includes(searchTerm) || collaborators.some((person) => person.position === position && matchesCollaboratorSearch(person))), [positions, collaborators, searchTerm, matchesCollaboratorSearch])
  const matchingCollaborators = useMemo(() => filteredCollaborators.filter(matchesCollaboratorSearch), [filteredCollaborators, matchesCollaboratorSearch])

  const addPosition = (position: string) => {
    if (selectedPositions.includes(position)) return
    setSelectedPositions((current) => [...current, position])
    setSelectedIds((current) => Array.from(new Set([...current, ...collaborators.filter((person) => person.position === position).map((person) => person.id)])))
  }

  const removePosition = (position: string) => {
    setSelectedPositions((current) => current.filter((value) => value !== position))
    const removedIds = new Set(collaborators.filter((person) => person.position === position).map((person) => person.id))
    setSelectedIds((current) => current.filter((id) => !removedIds.has(id)))
  }

  const toggleChannel = (channel: string) => setChannels((current) => current.includes(channel) ? current.filter((value) => value !== channel) : [...current, channel])
  const toggleRecipient = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])

  const copyContact = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast({ type: 'success', text: `${label} copiado.` })
    } catch {
      showToast({ type: 'error', text: `No fue posible copiar el ${label.toLocaleLowerCase('es-CL')}.` })
    }
  }

  const channelToggleSx = {
    minHeight: 34,
    px: 1.2,
    gap: 0.5,
    borderRadius: 999,
    borderColor: colors.managementBorder,
    color: colors.gray4,
    fontSize: 14,
    fontWeight: 600,
    textTransform: 'none',
    '&.Mui-selected, &.Mui-selected:hover': {
      bgcolor: colors.blue600,
      borderColor: colors.blue600,
      color: colors.white,
    },
  }

  const uploadAttachment = async () => {
    if (!attachment) return null
    const presignResponse = await fetch('/api/communications/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: attachment.name, contentType: attachment.type, fileSize: attachment.size }),
    })
    const presign = await presignResponse.json()
    if (!presignResponse.ok) throw new Error(presign?.error || 'No fue posible preparar el PDF.')
    const uploadResponse = await fetch(presign.upload_url, { method: 'PUT', headers: { 'Content-Type': attachment.type }, body: attachment })
    if (!uploadResponse.ok) throw new Error('No fue posible subir el PDF.')
    return { key: presign.key, name: attachment.name, content_type: attachment.type, size: attachment.size }
  }

  const send = async () => {
    if (!selectedPositions.length) return showToast({ type: 'info', text: 'Selecciona al menos un cargo.' })
    if (!selectedIds.length) return showToast({ type: 'info', text: 'Selecciona al menos un destinatario.' })
    if (selectedIds.length > MAX_CAMPAIGN_RECIPIENTS) return showToast({ type: 'info', text: `Selecciona un máximo de ${MAX_CAMPAIGN_RECIPIENTS} destinatarios por campaña.` })
    if (!title.trim() || !message.trim()) return showToast({ type: 'info', text: 'Completa el asunto y el mensaje.' })
    if (!channels.length) return showToast({ type: 'info', text: 'Selecciona al menos un canal.' })
    setSending(true)
    try {
      const uploadedAttachment = await uploadAttachment()
      const response = await fetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, channels, collaborator_ids: selectedIds, attachment: uploadedAttachment }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'No fue posible crear la campaña.')
      const whatsappSummary = channels.includes('whatsapp') ? ` WhatsApp enviados: ${result.whatsapp_sent || 0}${result.whatsapp_failed ? `, con error: ${result.whatsapp_failed}` : ''}.` : ''
      showToast({ type: 'success', text: `Campaña creada para ${result.recipients} destinatarios. Correos enviados: ${result.email_sent}.${whatsappSummary}` })
      setTitle('')
      setMessage('')
      setAttachment(null)
      setSelectedIds([])
      await load()
      if (channels.includes('whatsapp') && (!result.whatsapp_automated || Number(result.whatsapp_failed || 0) > 0)) await openCampaign(result.campaign_id)
    } catch (error) {
      showToast({ type: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setSending(false)
    }
  }

  const openCampaign = async (id: string) => {
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/communications/${id}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'No fue posible abrir la campaña.')
      setDetail(data)
    } catch (error) {
      showToast({ type: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setDetailLoading(false)
    }
  }

  const sharePdf = async (delivery: Delivery) => {
    if (!delivery.attachment_url) return showToast({ type: 'info', text: 'Esta campaña no tiene PDF adjunto.' })
    try {
      const response = await fetch(delivery.attachment_url)
      if (!response.ok) throw new Error('El PDF ya no está disponible.')
      const blob = await response.blob()
      const file = new File([blob], detail?.campaign.attachment_name || 'documento.pdf', { type: 'application/pdf' })
      const shareData = { title: detail?.campaign.title || 'Documento', text: detail?.campaign.title || 'Documento', files: [file] }
      if (navigator.canShare && navigator.canShare(shareData) && navigator.share) {
        await navigator.share(shareData)
        return
      }
      const objectUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = file.name
      link.click()
      URL.revokeObjectURL(objectUrl)
      showToast({ type: 'info', text: 'El navegador descargó el PDF. Adjuntalo manualmente en WhatsApp.' })
    } catch (error) {
      showToast({ type: 'error', text: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <Box sx={{ display: 'flex', width: '100%', maxWidth: '100%', minHeight: '100vh', overflowX: 'hidden', bgcolor: colors.managementWhiteSoft }}>
      <Box sx={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
        <UserHeader title="Comunicaciones" />
        <Container
          component="main"
          maxWidth={false}
          disableGutters
          sx={{
            pt: 0,
            pb: 2,
            px: 0,
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
            overflowX: 'hidden',
          }}
        >
        <Stack spacing={0}>
          {!loading && <AppTabs
            ariaLabel="Secciones de Comunicaciones"
            value={activeTab}
            onChange={(value) => selectTab(value as typeof activeTab)}
            items={[
              ...(canSend ? [{ value: 'send', label: 'Envíos', icon: <SendTabIcon /> }] : []),
              ...(canManageForms ? [{ value: 'forms', label: 'Formulario', icon: <FormTabIcon /> }] : []),
            ]}
          />}
          <Box sx={{ minWidth: 0, px: { xs: 1, sm: 1.5, md: 2 } }}>
          <Stack spacing={2}>
          {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : activeTab === 'forms' ? (
            <ConditionalFormsPanel collaborators={collaborators} canCreate={canManageForms} attendanceDate={attendanceDate} />
          ) : <>
            <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderColor: colors.managementBorder }}>
              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, color: colors.blue3 }}>Destinatarios</Typography>
                    <Typography variant="caption" color="text.secondary">Selecciona uno o más cargos y luego las personas a quienes se preparará el envío.</Typography>
                  </Box>
                  <AppSearchField value={positionSearch} onChange={(event) => setPositionSearch(event.target.value)} label="Buscar destinatario" placeholder="Cargo, nombre, correo o teléfono" InputProps={{ endAdornment: positionSearch ? <Tooltip title="Limpiar búsqueda"><AppIconButton size="small" aria-label="Limpiar búsqueda" onClick={() => setPositionSearch('')} edge="end" sx={{ mr: -1, color: colors.gray7, '&:hover': { color: colors.white, bgcolor: colors.gray7 } }}><Close fontSize="small" /></AppIconButton></Tooltip> : undefined }} sx={{ width: { xs: '100%', sm: 320 } }} />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
                  <Box sx={{ border: `1px solid ${colors.managementBorder}`, borderRadius: 1, overflow: 'hidden' }}>
                    <Box sx={{ px: 1.25, py: 0.75, bgcolor: colors.managementTableHead }}><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Cargos disponibles</Typography></Box>
                    <Stack spacing={0.5} sx={{ p: 0.75, maxHeight: 250, overflowY: 'auto' }}>
                      {matchingPositions.filter((position) => !selectedPositions.includes(position)).map((position) => <AppButton key={position} variant="text" color="primary" endIcon={<MoveIcon direction="right" />} onClick={() => addPosition(position)} disabled={!canSend} sx={{ justifyContent: 'space-between', textAlign: 'left', minHeight: 34, color: colors.blue4, fontSize: 12.5, '&:hover .move-outline': { display: 'none' }, '&:hover .move-filled': { display: 'block' } }}>{position.toLocaleUpperCase('es-CL')}</AppButton>)}
                      {matchingPositions.filter((position) => !selectedPositions.includes(position)).length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 0.75, py: 1 }}>{positionSearch ? 'No hay coincidencias disponibles.' : 'No quedan cargos disponibles.'}</Typography>}
                    </Stack>
                  </Box>
                  <Box sx={{ border: `1px solid ${colors.managementBorder}`, borderRadius: 1, overflow: 'hidden', bgcolor: colors.white }}>
                    <Box sx={{ px: 1.25, py: 0.75, bgcolor: colors.managementTableHead }}><Typography variant="subtitle2" sx={{ fontWeight: 800, color: colors.blue3 }}>Incluidos en la comunicación</Typography></Box>
                    <Stack spacing={0.5} sx={{ p: 0.75, maxHeight: 250, overflowY: 'auto' }}>
                      {selectedPositions.filter((position) => matchingPositions.includes(position)).map((position) => <AppButton key={position} variant="text" color="primary" startIcon={<MoveIcon direction="left" />} onClick={() => removePosition(position)} disabled={!canSend} sx={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 34, fontWeight: 800, color: colors.blue4, fontSize: 12.5, '&:hover .move-outline': { display: 'none' }, '&:hover .move-filled': { display: 'block' } }}>{position.toLocaleUpperCase('es-CL')}</AppButton>)}
                      {selectedPositions.filter((position) => matchingPositions.includes(position)).length === 0 && <Typography variant="body2" sx={{ px: 0.75, py: 1, color: colors.gray4 }}>{positionSearch && selectedPositions.length ? 'No hay coincidencias incluidas.' : 'Agrega cargos desde la lista disponible.'}</Typography>}
                    </Stack>
                  </Box>
                </Box>
                {selectedPositions.length > 0 && <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: 0.75, pt: 0.5 }}>
                  {matchingCollaborators.map((person) => {
                    const isSelected = selectedIds.includes(person.id)
                    const contactTriggerSx = { display: 'inline-flex', alignItems: 'center', gap: 0.25, color: colors.gray4, fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.66, cursor: 'default' }
                    const contactTooltip = (label: string, value: string, icon: ReactNode) => <Tooltip arrow placement="top" title={<Box sx={{ p: 0.25, minWidth: 190 }}><Typography variant="caption" sx={{ display: 'block', color: 'inherit', fontWeight: 800 }}>{label}</Typography><Stack direction="row" alignItems="center" spacing={0.25}><Typography variant="caption" sx={{ flex: 1, overflowWrap: 'anywhere' }}>{value}</Typography><AppIconButton size="small" aria-label={`Copiar ${label.toLocaleLowerCase('es-CL')}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void copyContact(value, label) }} sx={{ color: 'inherit' }}><ContentCopyOutlined fontSize="inherit" /></AppIconButton></Stack></Box>}><Box component="span" onClick={(event) => event.stopPropagation()} sx={contactTriggerSx}>{icon}{label}</Box></Tooltip>
                    return <FormControlLabel key={person.id} sx={{ m: 0, px: 0.75, py: 0.25, border: `1px solid ${isSelected ? colors.blue600 : colors.managementBorder}`, borderRadius: 1, bgcolor: isSelected ? colors.blue50 : 'transparent', alignItems: 'center' }} control={<AppCheckbox checked={isSelected} onChange={() => toggleRecipient(person.id)} disabled={!canSend} size="small" />} label={<Box sx={{ py: 0.25 }}><Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{person.name.toLocaleUpperCase('es-CL')}</Typography><Stack direction="row" spacing={0.5} divider={<Typography variant="caption" color="text.secondary">·</Typography>} sx={{ mt: 0.25, flexWrap: 'wrap', alignItems: 'center' }}><Box component="span" sx={contactTriggerSx}><ManageAccountsOutlined sx={{ fontSize: 12 }} />{formatPosition(person.position)}</Box>{person.email && contactTooltip('Correo', person.email, <EmailOutlined sx={{ fontSize: 12 }} />)}{person.phone && contactTooltip('WhatsApp', person.phone, <WhatsApp sx={{ fontSize: 12 }} />)}</Stack></Box>} />
                  })}
                  {matchingCollaborators.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 0.75, py: 1 }}>No hay destinatarios que coincidan con la búsqueda.</Typography>}
                </Box>}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderColor: colors.managementBorder }}>
              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Box><Typography sx={{ fontWeight: 800, color: colors.blue3 }}>Mensaje</Typography><Typography variant="caption" color="text.secondary">{selectedIds.length} destinatarios seleccionados · Correo: {contactSummary.email} · WhatsApp: {contactSummary.whatsapp}</Typography></Box>
                  <Stack direction="row" spacing={0.75}>
                    <AppToggleButton value="email" selected={channels.includes('email')} onChange={() => toggleChannel('email')} disabled={!canSend} sx={channelToggleSx}>{channels.includes('email') ? <EmailOutlined sx={{ fontSize: 17 }} /> : <MailX size={17} />}Correo</AppToggleButton>
                    <AppToggleButton value="whatsapp" selected={channels.includes('whatsapp')} onChange={() => toggleChannel('whatsapp')} disabled={!canSend} sx={channelToggleSx}>{channels.includes('whatsapp') ? <WhatsApp sx={{ fontSize: 17 }} /> : <MessageCircleOff size={17} />}WhatsApp</AppToggleButton>
                  </Stack>
                </Box>
                <AppTextField value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canSend} label="Asunto" />
                <AppTextField value={message} onChange={(event) => setMessage(event.target.value)} disabled={!canSend} label="Mensaje" placeholder="Escribe el mensaje" multiline minRows={5} />
                <FileDropzone file={attachment} accept="application/pdf,.pdf" disabled={!canSend} maxSizeBytes={10 * 1024 * 1024} label="Arrastra y suelta el PDF aquí" helperText="PDF · máximo 10 MB" onFileChange={setAttachment} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <AppButton variant="contained" size="large" startIcon={<SendOutlined />} onClick={() => void send()} disabled={!canSend || sending}>{sending ? 'Enviando...' : 'Crear y enviar'}</AppButton>
                </Box>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ borderColor: colors.managementBorder }}>
              <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${colors.managementBorder}` }}><Typography sx={{ fontWeight: 800, color: colors.blue3 }}>Campañas recientes</Typography></Box>
              {campaigns.length === 0 ? <Typography sx={{ p: 2, color: colors.gray4 }}>Aún no existen campañas en este proyecto.</Typography> : <List disablePadding>{campaigns.map((campaign, index) => <ListItem key={campaign.id} divider={index < campaigns.length - 1} secondaryAction={<AppButton size="small" onClick={() => void openCampaign(campaign.id)} disabled={detailLoading}>Ver</AppButton>}><ListItemText primary={<Typography sx={{ fontWeight: 700 }}>{campaign.title}</Typography>} secondary={`${formatDateTime(campaign.created_at)} · ${(campaign.channels || []).join(' + ')}${campaign.attachment_name ? ` · ${campaign.attachment_name}` : ''}`} /></ListItem>)}</List>}
            </Paper>
          </>}
          </Stack>
          </Box>
        </Stack>
        </Container>
        <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="md">
          <DialogTitle>{detail?.campaign.title}</DialogTitle>
          <DialogContent dividers>
            <Typography sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{detail?.campaign.message}</Typography>
            <Divider sx={{ mb: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800 }}>Acciones de WhatsApp</Typography>
            {(detail?.deliveries || []).filter((delivery) => delivery.channel === 'whatsapp').length === 0 ? <Typography variant="body2" color="text.secondary">Esta campaña no incluye WhatsApp.</Typography> : <List disablePadding>{detail?.deliveries.filter((delivery) => delivery.channel === 'whatsapp').map((delivery) => <ListItem key={delivery.id} divider secondaryAction={<Stack direction="row" spacing={0.25}>{delivery.whatsapp_url && <Tooltip title="Abrir WhatsApp"><Box component="a" href={delivery.whatsapp_url} target="_blank" rel="noreferrer" sx={{ display: 'inline-flex' }}><AppIconButton color="primary"><WhatsApp /></AppIconButton></Box></Tooltip>}{delivery.attachment_url && <Tooltip title="Compartir PDF"><AppIconButton onClick={() => void sharePdf(delivery)} color="primary"><ShareOutlined /></AppIconButton></Tooltip>}</Stack>}><ListItemText primary={delivery.recipient_name} secondary={delivery.recipient_phone || 'Sin teléfono registrado'} /></ListItem>)}</List>}
          </DialogContent>
          <DialogActions><AppButton onClick={() => setDetail(null)}>Cerrar</AppButton></DialogActions>
        </Dialog>
      </Box>
    </Box>
  )
}
