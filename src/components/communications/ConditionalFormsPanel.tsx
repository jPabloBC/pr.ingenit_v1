'use client'

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Box, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Paper, Stack, Tooltip, Typography } from '@mui/material'
import { AddOutlined, AssessmentOutlined, ContentCopyOutlined, DeleteOutline, EditOutlined, ExpandMore, FileDownloadOutlined } from '@mui/icons-material'
import { colors } from '@/theme/theme'
import { COMMUNICATION_FORM_MAX_FILE_BYTES, formatCommunicationFormRut, resolveCommunicationFormContentType } from '@/lib/communicationForms'
import { AppButton } from '@/components/ui/AppButton'
import { AppAlert } from '@/components/ui/AppAlert'
import { useAppSnackbar } from '@/components/ui/AppSnackbarProvider'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { AppSearchField, AppSelect, AppTextField } from '@/components/ui/FormControls'
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog'
import { AppCheckbox, AppChip, AppIconButton } from '@/components/ui/InteractiveControls'
import { AppFloatingActionButton } from '@/components/ui/AppFloatingActionButton'

type QuestionDraft = { id: string; prompt: string; type: 'single_choice' | 'multiple_choice' | 'text'; optionsText: string; required: boolean }
type ResultDraft = { id: string; title: string; description: string; questionId: string; matchValue: string; isDefault: boolean; file: File | null }
type Collaborator = { id: string; name: string; document: string; position: string; specialty: string; workerType: string; attendanceStatus: string; shift: string; phone: string; email: string }
type ExpectedProfile = { first_name?: string | null; last_name?: string | null; document?: string | null; position?: string | null; specialty?: string | null; shift_pattern?: string | null }
type Invitation = { id: string; recipient_name: string; recipient_email?: string | null; recipient_phone?: string | null; status: string; submitted_at?: string | null; public_url: string; answers?: Record<string, unknown> | null; expected_profile?: ExpectedProfile | null }
type FormQuestion = { id: string; prompt: string }
type FormRow = { id: string; title: string; description: string; status: string; public_url: string; created_at: string; questions: FormQuestion[]; summary: { total: number; pending: number; completed: number; revoked: number; expected: number; expected_completed: number; expected_pending: number; additional: number }; invitations: Invitation[] }
type EditDraft = { id: string; title: string; description: string; status: 'draft' | 'published' | 'archived' }

const newQuestion = (index: number): QuestionDraft => ({ id: `question-${Date.now()}-${index}`, prompt: '', type: 'single_choice', optionsText: '', required: true })
const newResult = (index: number): ResultDraft => ({ id: `result-${Date.now()}-${index}`, title: `Resultado ${index}`, description: '', questionId: '', matchValue: '', isDefault: index === 1, file: null })
const displayAnswer = (value: unknown) => Array.isArray(value) ? value.map(String).join(', ') : String(value || '').trim() || 'Sin respuesta'
const displayUppercaseAnswer = (value: unknown) => displayAnswer(value).toLocaleUpperCase('es-CL')
const normalizedSearch = (value: unknown) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleUpperCase('es-CL')
const titleCase = (value: unknown) => String(value || '').trim().toLocaleLowerCase('es-CL').split(/\s+/).map((word) => word ? `${word.charAt(0).toLocaleUpperCase('es-CL')}${word.slice(1)}` : '').join(' ')
const multiSelectValues = (value: unknown) => Array.isArray(value) ? value.map(String) : String(value || '').split(',').filter(Boolean)
const multiSelectLabel = (value: unknown, placeholder: string) => {
  const selected = multiSelectValues(value)
  if (selected.length === 0) return placeholder
  if (selected.length > 2) return `${selected.length} SELECCIONADOS`
  return selected.map((item) => item.toLocaleUpperCase('es-CL')).join(', ')
}
const invitationIdentity = (invitation: Invitation) => invitation.answers?.__identity && typeof invitation.answers.__identity === 'object'
  ? invitation.answers.__identity as Record<string, unknown>
  : null

const InvitationAccordion = ({ invitation, questions }: { invitation: Invitation; questions: FormQuestion[] }) => {
  const identity = invitationIdentity(invitation)
  const isExpected = invitation.answers?.__expected === true
  const expectedName = `${String(invitation.expected_profile?.first_name || '').trim()} ${String(invitation.expected_profile?.last_name || '').trim()}`.trim()
  const summaryName = isExpected && expectedName ? expectedName : invitation.recipient_name
  const summaryRut = isExpected ? invitation.expected_profile?.document : identity?.rut
  const summaryPosition = isExpected ? invitation.expected_profile?.position : identity?.position
  const summaryShift = isExpected ? invitation.expected_profile?.shift_pattern : identity?.shift
  const signature = typeof invitation.answers?.__signature === 'string' && invitation.answers.__signature.startsWith('data:image/png;base64,')
    ? invitation.answers.__signature
    : ''
  const statusLabel = invitation.status === 'completed' ? (isExpected ? 'Respondido' : 'Adicional') : 'Pendiente'
  return <Accordion disableGutters elevation={0} sx={{ borderBottom: `1px solid ${colors.managementBorder}`, '&:before': { display: 'none' } }}>
    <AccordionSummary
      expandIcon={<ExpandMore />}
      sx={{
        '& .MuiAccordionSummary-content': { mr: 0 },
        '& .MuiAccordionSummary-expandIconWrapper': { position: 'absolute', right: 16 },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1.5fr 1fr 1fr' }, gap: 1, alignItems: 'center' }}>
        <Box><Typography sx={{ fontWeight: 700 }}>{summaryName.toLocaleUpperCase('es-CL')}</Typography><Typography variant="caption" color="text.secondary">{invitation.recipient_phone || invitation.recipient_email || 'Sin contacto'}</Typography></Box>
        <Typography variant="body2">{formatCommunicationFormRut(summaryRut) || 'Sin respuesta'}</Typography>
        <Typography variant="body2">{displayUppercaseAnswer(summaryPosition)}</Typography>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>{displayAnswer(summaryShift)}</Typography>
        <AppChip size="small" color={invitation.status === 'completed' ? (isExpected ? 'success' : 'info') : 'warning'} variant="outlined" label={statusLabel} sx={{ justifySelf: 'start' }} />
      </Box>
    </AccordionSummary>
    <AccordionDetails>
      {invitation.status !== 'completed' ? <Typography variant="body2" color="text.secondary">El formulario todavía no ha sido completado.</Typography> : <Stack spacing={1.5}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1.5fr 1fr 1fr' }, gap: 1, alignItems: 'start' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' } }}>Colaborador</Typography>
            <Typography variant="body2">{displayUppercaseAnswer(`${String(identity?.first_names || '').trim()} ${String(identity?.last_names || '').trim()}`)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' } }}>RUT</Typography>
            <Typography variant="body2">{formatCommunicationFormRut(identity?.rut) || 'Sin respuesta'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' } }}>Cargo</Typography>
            <Typography variant="body2">{displayUppercaseAnswer(identity?.position)}</Typography>
          </Box>
          <Box sx={{ textAlign: { xs: 'left', md: 'center' } }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' } }}>Turno</Typography>
            <Typography variant="body2">{displayAnswer(identity?.shift)}</Typography>
          </Box>
          <Box aria-hidden="true" sx={{ display: { xs: 'none', md: 'block' } }} />
        </Box>
        {signature && <Divider />}
        {signature && <Box><Typography variant="caption" color="text.secondary">Firma registrada</Typography><Box component="img" src={signature} alt={`Firma de ${invitation.recipient_name}`} sx={{ display: 'block', mt: 0.75, width: '100%', maxWidth: 460, height: 150, objectFit: 'contain', objectPosition: 'left center', border: `1px solid ${colors.managementBorder}`, borderRadius: 1, bgcolor: colors.white }} /></Box>}
        {questions.length > 0 && <Divider />}
        {questions.map((question) => <Box key={question.id}><Typography variant="caption" color="text.secondary">{question.prompt}</Typography><Typography variant="body2">{displayAnswer(invitation.answers?.[question.id])}</Typography></Box>)}
      </Stack>}
    </AccordionDetails>
  </Accordion>
}

const ExpectedCollaboratorSelector = memo(function ExpectedCollaboratorSelector({
  attendanceDate,
  collaborators,
  recipientIds,
  resetKey,
  setRecipientIds,
}: {
  attendanceDate?: string
  collaborators: Collaborator[]
  recipientIds: string[]
  resetKey: number
  setRecipientIds: Dispatch<SetStateAction<string[]>>
}) {
  const [search, setSearch] = useState('')
  const [positions, setPositions] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [workerTypes, setWorkerTypes] = useState<string[]>([])
  const [attendanceStatuses, setAttendanceStatuses] = useState<string[]>([])
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    setSearch('')
    setPositions([])
    setSpecialties([])
    setWorkerTypes([])
    setAttendanceStatuses([])
  }, [resetKey])

  const positionOptions = useMemo(() => Array.from(new Set(collaborators.map((person) => person.position).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [collaborators])
  const specialtyOptions = useMemo(() => Array.from(new Set(collaborators.map((person) => person.specialty).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [collaborators])
  const workerTypeOptions = useMemo(() => Array.from(new Set(collaborators.map((person) => person.workerType).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [collaborators])
  const attendanceStatusOptions = useMemo(() => Array.from(new Set(collaborators.map((person) => person.attendanceStatus || 'Sin registro'))).sort((a, b) => a.localeCompare(b, 'es')), [collaborators])
  const filteredCollaborators = useMemo(() => {
    const normalized = normalizedSearch(deferredSearch)
    return collaborators.filter((person) => (positions.length === 0 || positions.includes(person.position))
      && (specialties.length === 0 || specialties.includes(person.specialty))
      && (workerTypes.length === 0 || workerTypes.includes(person.workerType))
      && (attendanceStatuses.length === 0 || attendanceStatuses.includes(person.attendanceStatus || 'Sin registro'))
      && (!normalized || [person.name, person.document, formatCommunicationFormRut(person.document), person.position, person.specialty, person.workerType, person.attendanceStatus, person.shift].some((value) => normalizedSearch(value).includes(normalized))))
  }, [attendanceStatuses, collaborators, deferredSearch, positions, specialties, workerTypes])

  const clear = () => {
    setRecipientIds([])
    setSearch('')
    setPositions([])
    setSpecialties([])
    setWorkerTypes([])
    setAttendanceStatuses([])
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0, position: { lg: 'sticky' }, top: { lg: 0 }, maxHeight: { lg: 'calc(90vh - 150px)' }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Typography sx={{ fontWeight: 800, color: colors.blue3 }}>Colaboradores esperados</Typography>
        <AppChip size="small" label={recipientIds.length} color={recipientIds.length ? 'primary' : 'default'} variant="outlined" />
      </Stack>
      <AppSearchField fullWidth label="Buscar colaborador" placeholder="Nombre, RUT, cargo o especialidad" value={search} onChange={(event) => setSearch(event.target.value.toLocaleUpperCase('es-CL'))} inputProps={{ style: { textTransform: 'uppercase' } }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
        <AppSelect label="Cargo" value={positions} SelectProps={{ multiple: true, renderValue: (value) => multiSelectLabel(value, 'Todos') }} onChange={(event) => setPositions(multiSelectValues(event.target.value))}>{positionOptions.map((position) => <MenuItem key={position} value={position}><AppCheckbox checked={positions.includes(position)} /><Typography variant="body2">{position.toLocaleUpperCase('es-CL')}</Typography></MenuItem>)}</AppSelect>
        <AppSelect label="Especialidad" value={specialties} SelectProps={{ multiple: true, renderValue: (value) => multiSelectLabel(value, 'Todas') }} onChange={(event) => setSpecialties(multiSelectValues(event.target.value))}>{specialtyOptions.map((specialty) => <MenuItem key={specialty} value={specialty}><AppCheckbox checked={specialties.includes(specialty)} /><Typography variant="body2">{specialty.toLocaleUpperCase('es-CL')}</Typography></MenuItem>)}</AppSelect>
        <AppSelect label="Tipo de trabajador" value={workerTypes} SelectProps={{ multiple: true, renderValue: (value) => multiSelectLabel(value, 'Todos') }} onChange={(event) => setWorkerTypes(multiSelectValues(event.target.value))}>{workerTypeOptions.map((workerType) => <MenuItem key={workerType} value={workerType}><AppCheckbox checked={workerTypes.includes(workerType)} /><Typography variant="body2">{workerType.toLocaleUpperCase('es-CL')}</Typography></MenuItem>)}</AppSelect>
        <AppSelect label="Asistencia actual" value={attendanceStatuses} SelectProps={{ multiple: true, renderValue: (value) => multiSelectLabel(value, 'Todos') }} onChange={(event) => setAttendanceStatuses(multiSelectValues(event.target.value))}>{attendanceStatusOptions.map((status) => <MenuItem key={status} value={status}><AppCheckbox checked={attendanceStatuses.includes(status)} /><Typography variant="body2">{status.toLocaleUpperCase('es-CL')}</Typography></MenuItem>)}</AppSelect>
      </Box>
      {attendanceDate && <Typography variant="caption" color="text.secondary">Asistencia correspondiente al {attendanceDate.split('-').reverse().join('/')}.</Typography>}
      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
        <AppButton size="small" onClick={() => setRecipientIds((current) => Array.from(new Set([...current, ...filteredCollaborators.map((person) => person.id)])).slice(0, 300))}>Seleccionar filtrados</AppButton>
        <AppButton size="small" onClick={clear}>Limpiar</AppButton>
      </Stack>
      <Typography variant="caption" color="text.secondary">La selección permite medir esperados, respondidos y pendientes. Todos usarán el mismo enlace público.</Typography>
      <Box sx={{ minHeight: 180, overflowY: 'auto', border: `1px solid ${colors.managementBorder}`, borderRadius: 1, flex: { lg: 1 } }}>
        {filteredCollaborators.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>No hay colaboradores que coincidan con los filtros.</Typography> : filteredCollaborators.map((person) => {
          const selected = recipientIds.includes(person.id)
          const details = [formatCommunicationFormRut(person.document) || 'Sin RUT', titleCase(person.position) || 'Sin cargo', titleCase(person.specialty) || 'Sin especialidad', titleCase(person.workerType) || 'Sin tipo', titleCase(person.attendanceStatus) || 'Sin registro'].join(' · ')
          return <FormControlLabel key={person.id} sx={{ display: 'flex', alignItems: 'flex-start', m: 0, px: 1, py: 0.75, minWidth: 0, borderBottom: `1px solid ${colors.managementBorder}`, '& .MuiFormControlLabel-label': { minWidth: 0 } }} control={<AppCheckbox checked={selected} disabled={!selected && recipientIds.length >= 300} onChange={() => setRecipientIds((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : current.length < 300 ? [...current, person.id] : current)} />} label={<Box sx={{ pt: 0.25, minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{person.name.toLocaleUpperCase('es-CL')}</Typography><Tooltip title={details} placement="top"><Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{details}</Typography></Tooltip></Box>} />
        })}
      </Box>
    </Paper>
  )
})

export default function ConditionalFormsPanel({ collaborators, canCreate, attendanceDate }: { collaborators: Collaborator[]; canCreate: boolean; attendanceDate?: string }) {
  const { notify } = useAppSnackbar()
  const [forms, setForms] = useState<FormRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [linksForm, setLinksForm] = useState<FormRow | null>(null)
  const [editForm, setEditForm] = useState<EditDraft | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [results, setResults] = useState<ResultDraft[]>([newResult(1)])
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [audienceResetKey, setAudienceResetKey] = useState(0)
  const [responseSearch, setResponseSearch] = useState('')
  const [responseStatus, setResponseStatus] = useState<'all' | 'completed' | 'pending'>('all')
  const [canAdminister, setCanAdminister] = useState(false)
  const [deleteForm, setDeleteForm] = useState<FormRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportingFormId, setExportingFormId] = useState<string | null>(null)
  const setNotice = useCallback((notice: { severity: 'success' | 'error' | 'info'; text: string }) => notify(notice.text, { severity: notice.severity }), [notify])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/communications/forms', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'No fue posible cargar los formularios.')
      setForms(Array.isArray(data.forms) ? data.forms : [])
      setCanAdminister(Boolean(data?.capabilities?.can_edit && data?.capabilities?.can_delete))
    } catch (error) {
      setNotice({ severity: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setLoading(false)
    }
  }, [setNotice])

  useEffect(() => { void load() }, [load])

  const reset = () => {
    setTitle('')
    setDescription('')
    setQuestions([])
    setResults([newResult(1)])
    setRecipientIds([])
    setAudienceResetKey((current) => current + 1)
  }
  const filteredResponses = useMemo(() => {
    const search = responseSearch.trim().toLocaleLowerCase('es-CL')
    return (linksForm?.invitations || []).filter((invitation) => {
      const identity = invitationIdentity(invitation)
      const matchesStatus = responseStatus === 'all' || (responseStatus === 'completed' ? invitation.status === 'completed' : invitation.status !== 'completed')
      const values = [invitation.recipient_name, identity?.rut, identity?.position, identity?.shift, invitation.expected_profile?.document, invitation.expected_profile?.position, invitation.expected_profile?.specialty]
      return matchesStatus && (!search || values.some((value) => String(value || '').toLocaleLowerCase('es-CL').includes(search)))
    })
  }, [linksForm, responseSearch, responseStatus])

  const upload = async (file: File) => {
    const contentType = resolveCommunicationFormContentType(file.name, file.type)
    const presignResponse = await fetch('/api/communications/forms/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType, fileSize: file.size }),
    })
    const presign = await presignResponse.json().catch(() => ({}))
    if (!presignResponse.ok) throw new Error(presign?.error || `No fue posible preparar ${file.name}.`)
    const uploadResponse = await fetch(presign.upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
    if (!uploadResponse.ok) throw new Error(`No fue posible subir ${file.name}.`)
    return { file_key: presign.key, file_name: file.name, content_type: contentType, size_bytes: file.size }
  }

  const save = async () => {
    if (!title.trim()) return setNotice({ severity: 'info', text: 'Completa el título.' })
    const normalizedQuestions = questions.map((question) => ({
      id: question.id,
      prompt: question.prompt.trim(),
      type: question.type,
      required: question.required,
      options: question.type === 'text' ? [] : Array.from(new Set(question.optionsText.split(/[\n,]/).map((option) => option.trim()).filter(Boolean))),
    }))
    if (normalizedQuestions.some((question) => !question.prompt || (question.type !== 'text' && question.options.length < 2))) return setNotice({ severity: 'info', text: 'Cada pregunta debe tener texto y al menos dos opciones.' })
    const preparedResults = results.map((result, index) => ({
      ...result,
      title: result.title.trim() || `Resultado ${index + 1}`,
      isDefault: results.length === 1 ? true : result.isDefault,
    }))
    if (preparedResults.some((result) => !result.file)) return setNotice({ severity: 'info', text: 'Cada resultado necesita un archivo.' })
    if (!preparedResults.some((result) => result.isDefault)) return setNotice({ severity: 'info', text: 'Define un resultado predeterminado.' })
    if (preparedResults.some((result) => !result.isDefault && (!result.questionId || !result.matchValue.trim()))) return setNotice({ severity: 'info', text: 'Cada resultado alternativo necesita una pregunta y una respuesta condicionante.' })
    setSaving(true)
    try {
      const uploadedResults = []
      for (const result of preparedResults) {
        const uploaded = await upload(result.file as File)
        uploadedResults.push({
          id: result.id,
          title: result.title.trim(),
          description: result.description.trim(),
          ...uploaded,
          is_default: result.isDefault,
          conditions: result.isDefault || !result.questionId || !result.matchValue.trim() ? [] : [{
            question_id: result.questionId,
            operator: questions.find((question) => question.id === result.questionId)?.type === 'multiple_choice' ? 'includes' : 'equals',
            value: result.matchValue.trim(),
          }],
        })
      }
      const response = await fetch('/api/communications/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, questions: normalizedQuestions, results: uploadedResults, collaborator_ids: recipientIds }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'No fue posible crear el formulario.')
      setNotice({ severity: 'success', text: 'Formulario creado. Ya puedes copiar y compartir su enlace público.' })
      setOpen(false)
      reset()
      await load()
    } catch (error) {
      setNotice({ severity: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/communications/forms/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'No fue posible eliminar el formulario.')
      setForms((current) => current.filter((form) => form.id !== id))
      setNotice({ severity: 'success', text: 'Formulario eliminado.' })
      setDeleteForm(null)
    } catch (error) {
      setNotice({ severity: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setDeleting(false)
    }
  }

  const update = async () => {
    if (!editForm?.title.trim()) return setNotice({ severity: 'info', text: 'El título es obligatorio.' })
    setSaving(true)
    try {
      const response = await fetch(`/api/communications/forms/${editForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editForm.title, description: editForm.description, status: editForm.status }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'No fue posible editar el formulario.')
      setEditForm(null)
      setNotice({ severity: 'success', text: 'Formulario actualizado.' })
      await load()
    } catch (error) {
      setNotice({ severity: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setSaving(false)
    }
  }

  const copy = async (value: string) => {
    const publicUrl = value.startsWith('/') ? `${window.location.origin}${value}` : value
    await navigator.clipboard.writeText(publicUrl)
    setNotice({ severity: 'success', text: 'Enlace copiado.' })
  }

  const exportResponses = async (form: FormRow) => {
    if (exportingFormId) return
    setExportingFormId(form.id)
    try {
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'PR Ingenit'
      workbook.created = new Date()
      const worksheet = workbook.addWorksheet('Respuestas', {
        views: [{ showGridLines: false, state: 'frozen', ySplit: 5 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      })
      const questionHeaders = form.questions.map((question) => question.prompt.toLocaleUpperCase('es-CL'))
      const headers = [
        'TIPO', 'ESTADO',
        'COLABORADOR ESPERADO', 'RUT ESPERADO', 'CARGO ESPERADO', 'ESPECIALIDAD ESPERADA', 'TURNO ESPERADO',
        'COLABORADOR RESPONDIÓ', 'RUT RESPONDIÓ', 'CARGO RESPONDIÓ', 'TURNO RESPONDIÓ',
        'CONTACTO', 'FECHA RESPUESTA', 'FIRMA',
        ...questionHeaders,
      ]
      const totalColumns = headers.length
      worksheet.mergeCells(1, 1, 1, totalColumns)
      const titleCell = worksheet.getCell(1, 1)
      titleCell.value = `RESPUESTAS · ${form.title.toLocaleUpperCase('es-CL')}`
      titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00264D' } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
      worksheet.getRow(1).height = 30

      worksheet.mergeCells(2, 1, 2, totalColumns)
      const summaryCell = worksheet.getCell(2, 1)
      summaryCell.value = `ESPERADOS: ${form.summary.expected}   |   RESPONDIERON: ${form.summary.expected_completed}   |   PENDIENTES: ${form.summary.expected_pending}   |   ADICIONALES: ${form.summary.additional}   |   AVANCE: ${form.summary.expected ? Math.round((form.summary.expected_completed / form.summary.expected) * 100) : 0}%`
      summaryCell.font = { bold: true, color: { argb: 'FF00264D' } }
      summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE4FF' } }
      summaryCell.alignment = { vertical: 'middle', horizontal: 'left' }
      worksheet.getRow(2).height = 25

      worksheet.mergeCells(3, 1, 3, totalColumns)
      const dateCell = worksheet.getCell(3, 1)
      dateCell.value = `EXPORTADO: ${new Date().toLocaleString('es-CL')}`
      dateCell.font = { italic: true, color: { argb: 'FF64748B' } }
      worksheet.getRow(4).height = 8

      const headerRow = worksheet.getRow(5)
      headerRow.values = headers
      headerRow.height = 34
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005ABF' } }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF99ADC2' } },
          left: { style: 'thin', color: { argb: 'FF99ADC2' } },
          bottom: { style: 'thin', color: { argb: 'FF99ADC2' } },
          right: { style: 'thin', color: { argb: 'FF99ADC2' } },
        }
      })

      form.invitations.forEach((invitation, invitationIndex) => {
        const identity = invitationIdentity(invitation)
        const isExpected = invitation.answers?.__expected === true
        const expectedName = `${String(invitation.expected_profile?.first_name || '').trim()} ${String(invitation.expected_profile?.last_name || '').trim()}`.trim()
        const respondedName = `${String(identity?.first_names || '').trim()} ${String(identity?.last_names || '').trim()}`.trim()
        const completed = invitation.status === 'completed'
        const status = completed ? (isExpected ? 'RESPONDIDO' : 'ADICIONAL') : invitation.status === 'revoked' ? 'REVOCADO' : 'PENDIENTE'
        const answerValues = form.questions.map((question) => {
          if (!completed) return ''
          const answer = invitation.answers?.[question.id]
          return Array.isArray(answer) ? answer.map(String).join('; ') : String(answer || '').trim()
        })
        const row = worksheet.addRow([
          isExpected ? 'ESPERADO' : 'ADICIONAL',
          status,
          (expectedName || (isExpected ? invitation.recipient_name : '')).toLocaleUpperCase('es-CL'),
          isExpected ? formatCommunicationFormRut(invitation.expected_profile?.document) : '',
          isExpected ? displayUppercaseAnswer(invitation.expected_profile?.position).replace('SIN RESPUESTA', '') : '',
          isExpected ? displayUppercaseAnswer(invitation.expected_profile?.specialty).replace('SIN RESPUESTA', '') : '',
          isExpected ? displayUppercaseAnswer(invitation.expected_profile?.shift_pattern).replace('SIN RESPUESTA', '') : '',
          respondedName.toLocaleUpperCase('es-CL'),
          completed ? formatCommunicationFormRut(identity?.rut) : '',
          completed ? displayUppercaseAnswer(identity?.position).replace('SIN RESPUESTA', '') : '',
          completed ? displayUppercaseAnswer(identity?.shift).replace('SIN RESPUESTA', '') : '',
          invitation.recipient_phone || invitation.recipient_email || '',
          invitation.submitted_at ? new Date(invitation.submitted_at).toLocaleString('es-CL') : '',
          completed && typeof invitation.answers?.__signature === 'string' ? 'SÍ' : 'NO',
          ...answerValues,
        ])
        row.height = 28
        row.eachCell((cell, columnNumber) => {
          cell.alignment = { vertical: 'middle', horizontal: [2, 4, 7, 9, 11, 13, 14].includes(columnNumber) ? 'center' : 'left', wrapText: true }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD7E0EA' } },
            left: { style: 'thin', color: { argb: 'FFD7E0EA' } },
            bottom: { style: 'thin', color: { argb: 'FFD7E0EA' } },
            right: { style: 'thin', color: { argb: 'FFD7E0EA' } },
          }
          if (invitationIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FC' } }
        })
        const statusCell = row.getCell(2)
        statusCell.font = { bold: true, color: { argb: status === 'RESPONDIDO' ? 'FF1B5E20' : status === 'ADICIONAL' ? 'FF005ABF' : status === 'REVOCADO' ? 'FFB91C1C' : 'FFA37C18' } }
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: status === 'RESPONDIDO' ? 'FFE8F5E9' : status === 'ADICIONAL' ? 'FFE3F2FD' : status === 'REVOCADO' ? 'FFFDECEC' : 'FFFFF8E1' } }
      })

      worksheet.columns = [
        { width: 14 }, { width: 15 },
        { width: 34 }, { width: 17 }, { width: 28 }, { width: 25 }, { width: 18 },
        { width: 34 }, { width: 17 }, { width: 28 }, { width: 18 },
        { width: 24 }, { width: 22 }, { width: 12 },
        ...form.questions.map(() => ({ width: 34 })),
      ]
      worksheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, 5 + form.invitations.length), column: totalColumns } }
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const safeTitle = form.title.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLocaleLowerCase('es-CL') || 'formulario'
      anchor.href = url
      anchor.download = `respuestas_${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setNotice({ severity: 'success', text: 'Excel de respuestas descargado.' })
    } catch (error) {
      setNotice({ severity: 'error', text: error instanceof Error ? error.message : 'No fue posible generar el Excel.' })
    } finally {
      setExportingFormId(null)
    }
  }

  return (
    <Stack spacing={2}>
      {canCreate && <AppFloatingActionButton ariaLabel="Nuevo formulario" tooltip="Nuevo formulario" placement="inline" onClick={() => setOpen(true)} />}
      {loading ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box> : forms.length === 0 ? <AppAlert severity="info">Aún no existen formularios.</AppAlert> : forms.map((form) => (
        <Paper key={form.id} variant="outlined" sx={{ borderColor: colors.managementBorder }}>
          <Box sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
              <Box><Typography sx={{ fontWeight: 800, color: colors.blue3 }}>{form.title}</Typography><Typography variant="body2" color="text.secondary">{form.description}</Typography></Box>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                <AppChip label={`${form.summary.expected} esperados`} />
                <AppChip variant="outlined" label={form.status === 'published' ? 'Publicado' : form.status === 'archived' ? 'Archivado' : 'Borrador'} />
                <AppChip color="success" variant="outlined" label={`${form.summary.completed} respuestas`} />
                <AppChip color="warning" variant="outlined" label={`${form.summary.expected_pending} pendientes`} />
                <Tooltip title="Copiar enlace público"><AppIconButton onClick={() => void copy(form.public_url)}><ContentCopyOutlined /></AppIconButton></Tooltip>
                <Tooltip title="Ver respuestas"><AppIconButton onClick={() => setLinksForm(form)}><AssessmentOutlined /></AppIconButton></Tooltip>
                <Tooltip title="Descargar respuestas en Excel"><AppIconButton disabled={Boolean(exportingFormId)} onClick={() => void exportResponses(form)}><FileDownloadOutlined /></AppIconButton></Tooltip>
                {canAdminister && <Tooltip title="Editar"><AppIconButton onClick={() => setEditForm({ id: form.id, title: form.title, description: form.description, status: form.status as EditDraft['status'] })}><EditOutlined /></AppIconButton></Tooltip>}
                {canAdminister && <Tooltip title="Eliminar"><AppIconButton color="error" onClick={() => setDeleteForm(form)}><DeleteOutline /></AppIconButton></Tooltip>}
              </Stack>
            </Stack>
          </Box>
        </Paper>
      ))}

      <ConfirmActionDialog
        open={Boolean(deleteForm)}
        title="Eliminar formulario"
        message="Se eliminarán el formulario, sus respuestas y los archivos asociados. Esta acción no se puede deshacer."
        detail={deleteForm?.title}
        confirmLabel="Eliminar"
        loading={deleting}
        variant="danger"
        onCancel={() => setDeleteForm(null)}
        onConfirm={() => { if (deleteForm) void remove(deleteForm.id) }}
      />

      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="xl">
        <DialogTitle>Nuevo formulario condicionado</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.55fr) minmax(360px, 0.85fr)' }, gap: 2, alignItems: 'start' }}>
          <Stack spacing={3} sx={{ minWidth: 0 }}>
            <Stack spacing={1.5}><AppTextField label="Título" value={title} onChange={(event) => setTitle(event.target.value)} required /><AppTextField label="Descripción" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={2} /></Stack>
            <Divider><AppChip label="Datos y preguntas" /></Divider>
            {questions.map((question, index) => <Paper key={question.id} variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1.25}><Stack direction="row" spacing={1}><AppTextField label={`Pregunta adicional ${index + 1}`} value={question.prompt} onChange={(event) => setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, prompt: event.target.value } : item))} /><AppSelect label="Tipo" value={question.type} sx={{ minWidth: 190 }} onChange={(event) => setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, type: event.target.value as QuestionDraft['type'] } : item))}><MenuItem value="single_choice">Una opción</MenuItem><MenuItem value="multiple_choice">Varias opciones</MenuItem><MenuItem value="text">Texto</MenuItem></AppSelect><AppIconButton color="error" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}><DeleteOutline /></AppIconButton></Stack><FormControlLabel control={<AppCheckbox checked={question.required} onChange={(event) => setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, required: event.target.checked } : item))} />} label={question.required ? 'Pregunta requerida' : 'Pregunta opcional'} />{question.type !== 'text' && <AppTextField label="Opciones separadas por coma o línea" value={question.optionsText} onChange={(event) => setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, optionsText: event.target.value } : item))} multiline minRows={2} />}</Stack></Paper>)}
            <AppButton startIcon={<AddOutlined />} onClick={() => setQuestions((current) => [...current, newQuestion(current.length + 1)])}>Agregar pregunta</AppButton>
            <Divider><AppChip label="Resultados" /></Divider>
            {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
            {results.map((result, index) => <Paper key={result.id} variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1.25}><Stack direction="row" spacing={1}><AppTextField label="Título del resultado" value={result.title} onChange={(event) => setResults((current) => current.map((item) => item.id === result.id ? { ...item, title: event.target.value } : item))} />{results.length > 1 && <AppIconButton color="error" onClick={() => setResults((current) => current.filter((item) => item.id !== result.id))}><DeleteOutline /></AppIconButton>}</Stack><AppTextField label="Descripción del resultado" value={result.description} onChange={(event) => setResults((current) => current.map((item) => item.id === result.id ? { ...item, description: event.target.value } : item))} /><FileDropzone file={result.file} accept=".pdf,.pptx,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg" maxSizeBytes={COMMUNICATION_FORM_MAX_FILE_BYTES} helperText="PDF, PPTX, video o audio · máximo 100 MB" onFileChange={(file) => setResults((current) => current.map((item) => item.id === result.id ? { ...item, file } : item))} /><FormControlLabel control={<AppCheckbox checked={result.isDefault || results.length === 1} disabled={results.length === 1} onChange={(event) => setResults((current) => current.map((item) => ({ ...item, isDefault: item.id === result.id ? event.target.checked : event.target.checked ? false : item.isDefault })))} />} label="Resultado predeterminado" />{!(result.isDefault || results.length === 1) && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><AppSelect label="Según pregunta" value={result.questionId} onChange={(event) => setResults((current) => current.map((item) => item.id === result.id ? { ...item, questionId: event.target.value } : item))}>{questions.map((question, questionIndex) => <MenuItem key={question.id} value={question.id}>{question.prompt || `Pregunta ${questionIndex + 1}`}</MenuItem>)}</AppSelect><AppTextField label="Si la respuesta es" value={result.matchValue} onChange={(event) => setResults((current) => current.map((item) => item.id === result.id ? { ...item, matchValue: event.target.value } : item))} /></Stack>}</Stack></Paper>)}
            <AppButton startIcon={<AddOutlined />} onClick={() => setResults((current) => [...current, newResult(current.length + 1)])}>Agregar resultado</AppButton>
          </Stack>
          <ExpectedCollaboratorSelector attendanceDate={attendanceDate} collaborators={collaborators} recipientIds={recipientIds} resetKey={audienceResetKey} setRecipientIds={setRecipientIds} />
          </Box>
        </DialogContent>
        <DialogActions><AppButton onClick={() => setOpen(false)} disabled={saving}>Cancelar</AppButton><AppButton variant="contained" onClick={() => void save()} disabled={saving}>{saving ? 'Creando...' : 'Crear formulario'}</AppButton></DialogActions>
      </Dialog>

      <Dialog open={Boolean(editForm)} onClose={() => !saving && setEditForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>Editar formulario</DialogTitle>
        <DialogContent dividers>
          {editForm && <Stack spacing={2}>
            <AppTextField label="Título" required value={editForm.title} onChange={(event) => setEditForm((current) => current ? { ...current, title: event.target.value } : current)} />
            <AppTextField label="Descripción" multiline minRows={3} value={editForm.description} onChange={(event) => setEditForm((current) => current ? { ...current, description: event.target.value } : current)} />
            <AppSelect label="Estado" value={editForm.status} onChange={(event) => setEditForm((current) => current ? { ...current, status: event.target.value as EditDraft['status'] } : current)}><MenuItem value="draft">Borrador</MenuItem><MenuItem value="published">Publicado</MenuItem><MenuItem value="archived">Archivado</MenuItem></AppSelect>
            <AppAlert severity="info">Las preguntas, reglas y archivos se mantienen para no alterar respuestas ya emitidas.</AppAlert>
          </Stack>}
        </DialogContent>
        <DialogActions><AppButton onClick={() => setEditForm(null)} disabled={saving}>Cancelar</AppButton><AppButton variant="contained" onClick={() => void update()} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</AppButton></DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(linksForm)}
        onClose={() => setLinksForm(null)}
        maxWidth={false}
        PaperProps={{ sx: { width: '80vw', maxWidth: '80vw' } }}
      >
        <DialogTitle>Respuestas · {linksForm?.title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 1 }}>
              {[
                ['Esperados', linksForm?.summary.expected || 0],
                ['Respondieron', linksForm?.summary.expected_completed || 0],
                ['Pendientes', linksForm?.summary.expected_pending || 0],
                ['Adicionales', linksForm?.summary.additional || 0],
                ['Avance', `${linksForm?.summary.expected ? Math.round((linksForm.summary.expected_completed / linksForm.summary.expected) * 100) : 0}%`],
              ].map(([label, value]) => (
                <Paper
                  key={String(label)}
                  variant="outlined"
                  sx={{ px: { xs: 1.25, sm: 1.5 }, py: 1.1, minHeight: 66, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.2 }}>{label}</Typography>
                  <Typography sx={{ flexShrink: 0, fontSize: { xs: '1.55rem', sm: '1.75rem' }, lineHeight: 1, fontWeight: 800, color: colors.blue3 }}>{value}</Typography>
                </Paper>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 1 }}>
              <AppSearchField label="Buscar respuesta" placeholder="Nombre, RUT, cargo o especialidad" value={responseSearch} onChange={(event) => setResponseSearch(event.target.value)} />
              <AppSelect label="Estado" value={responseStatus} onChange={(event) => setResponseStatus(event.target.value as typeof responseStatus)}><MenuItem value="all">Todos</MenuItem><MenuItem value="completed">Respondidos</MenuItem><MenuItem value="pending">Pendientes</MenuItem></AppSelect>
            </Box>
            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '2fr 1fr 1.5fr 1fr 1fr', gap: 1, px: 2, py: 1, bgcolor: colors.managementTableHead }}>
                {['Colaborador', 'RUT', 'Cargo', 'Turno', 'Estado'].map((label) => <Typography key={label} variant="caption" sx={{ fontWeight: 700, textAlign: label === 'Turno' ? 'center' : 'left' }}>{label}</Typography>)}
              </Box>
              {filteredResponses.length === 0 ? <Typography sx={{ p: 2 }} color="text.secondary">No hay registros que coincidan con los filtros.</Typography> : filteredResponses.map((invitation) => <InvitationAccordion key={invitation.id} invitation={invitation} questions={linksForm?.questions || []} />)}
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions><AppButton onClick={() => setLinksForm(null)}>Cerrar</AppButton></DialogActions>
      </Dialog>
    </Stack>
  )
}
