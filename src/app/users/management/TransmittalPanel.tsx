'use client'

import { useEffect, useMemo, useState } from 'react'
import { Box, Button, FormControl, IconButton, InputLabel, OutlinedInput, Paper, Popover, Stack, Tooltip, Typography } from '@mui/material'
import { AddOutlined, DeleteOutline, DescriptionOutlined, PrintOutlined } from '@mui/icons-material'
import { DateCalendar, LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { es } from 'date-fns/locale'
import { useSession } from 'next-auth/react'

type DailyReport = {
  id: string
  report_no?: number
  report_date?: string
  work_front?: string
  document_type?: 'daily_report' | 'field_report'
  document_name?: string
}
type DocumentEntry = {
  id: string
  name: string
  specialty: string
  comment: string
  revision: string
  manual?: boolean
}
const formatDate = (date: string) => date ? date.split('-').reverse().join('-') : ''
const formatShortDate = (date: string) => date ? `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(2, 4)}` : ''
const formatHeaderDate = (date: string) => date ? new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`)).replace(' ', '-') : ''
const buildPrintFileName = (registerNumber: string, reportDate: string) =>
  `${registerNumber}.- Transmital entrega de Reportes ${formatDate(reportDate)}`
const parseYmdToDate = (value: string) => {
  const [year, month, day] = String(value || '').split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day) : null
}
const dateToYmd = (value: Date | null) => value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` : ''

export default function TransmittalPanel() {
  const { data: session } = useSession()
  const [date, setDate] = useState('')
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [dateAnchorEl, setDateAnchorEl] = useState<HTMLElement | null>(null)
  const [reports, setReports] = useState<DailyReport[]>([])
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [registerNo, setRegisterNo] = useState('')
  const [contractNo, setContractNo] = useState('')
  const [projectName, setProjectName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(() => dateToYmd(new Date()))
  const [documentEdits, setDocumentEdits] = useState<Record<string, Partial<DocumentEntry>>>({})
  const [manualDocuments, setManualDocuments] = useState<DocumentEntry[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/company-assets?usage_context=transmittal', { cache: 'no-store' }).then((res) => res.json()),
      fetch('/api/company-assets?asset_type=daily_report_logo', { cache: 'no-store' }).then((res) => res.json()),
    ])
      .then(([transmittalData, dailyReportData]) => {
        const assets = [...(Array.isArray(transmittalData?.assets) ? transmittalData.assets : []), ...(Array.isArray(dailyReportData?.assets) ? dailyReportData.assets : [])]
        const asset = assets.find((item: any) => item?.is_default) || assets[0]
        if (asset?.r2_key) setLogoUrl(`/api/company-assets/file?key=${encodeURIComponent(asset.r2_key)}`)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    fetch('/api/transmittals?dates=1', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const dates = Array.from(new Set<string>(
          (Array.isArray(data?.dates) ? data.dates : [])
            .map((value: unknown) => String(value || '').slice(0, 10))
            .filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value))
        )).sort((a, b) => a.localeCompare(b))
        setAvailableDates(dates)
        setDate((current) => dates.includes(current) ? current : (dates[dates.length - 1] || ''))
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    fetch('/api/transmittal-settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setProjectName(String(data?.project_name || ''))
        setContractNo(String(data?.contract_number || ''))
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    setRegisterNo('')
    setDocumentEdits({})
    setManualDocuments([])
    if (!date) {
      setReports([])
      setIncluded({})
      return
    }
    fetch(`/api/transmittals?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const rows = Array.isArray(data) ? data : Array.isArray(data?.reports) ? data.reports : []
        setReports(rows)
        setIncluded(Object.fromEntries(rows.map((row: DailyReport) => [row.id, true])))
      })
      .catch(() => !cancelled && setReports([]))
    return () => { cancelled = true }
  }, [date])

  const selectedReports = useMemo(() => reports.filter((row) => included[row.id]), [reports, included])
  const displayedDocuments = useMemo<DocumentEntry[]>(() => [
    ...selectedReports.map((row) => ({
      id: row.id,
      name: row.document_name || `Daily Report ${String(row.work_front || '')} N°${String(row.report_no || '').padStart(3, '0')}`,
      specialty: 'OTEC',
      comment: 'Físico',
      revision: 'Rev.0',
      ...documentEdits[row.id],
    })),
    ...manualDocuments,
  ].slice(0, 9), [selectedReports, documentEdits, manualDocuments])
  const allowedDateSet = useMemo(() => new Set(availableDates), [availableDates])
  const displayedRegisterNo = useMemo(() => {
    if (registerNo) return registerNo
    const currentReportNo = Math.max(0, ...reports.map((row) => Number(row.report_no || 0)))
    return currentReportNo > 0 ? String(currentReportNo + 3) : '-'
  }, [registerNo, reports])
  const companyName = String(session?.user?.companyName || 'PUMA INGENIERÍA Y CONSTRUCCIÓN').toUpperCase()
  const displayedProjectName = projectName || companyName

  const updateDocument = (id: string, field: keyof Pick<DocumentEntry, 'name' | 'specialty' | 'comment' | 'revision'>, value: string) => {
    if (id.startsWith('manual-')) {
      setManualDocuments((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item))
      return
    }
    setDocumentEdits((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))
  }

  const addManualDocument = () => {
    if (displayedDocuments.length >= 9) return
    setManualDocuments((current) => [...current, {
      id: `manual-${Date.now()}-${current.length}`,
      name: '',
      specialty: 'OTEC',
      comment: 'Físico',
      revision: 'Rev.0',
      manual: true,
    }])
  }

  const printTransmittal = (issuedRegisterNo: string) => {
    const body = document.body
    const originalTitle = document.title
    const cleanup = () => {
      body.classList.remove('transmittal-printing')
      document.title = originalTitle
      window.removeEventListener('afterprint', cleanup)
    }
    document.title = buildPrintFileName(issuedRegisterNo, date)
    body.classList.add('transmittal-printing')
    window.addEventListener('afterprint', cleanup, { once: true })
    window.print()
    window.setTimeout(cleanup, 0)
  }

  const handlePrint = async () => {
    try {
      if (!date || displayedDocuments.length === 0) return
      const response = await fetch('/api/transmittal-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportDate: date }) })
      const data = await response.json().catch(() => ({}))
      if (response.ok && Number.isFinite(Number(data?.registerNumber))) {
        const issuedRegisterNo = String(data.registerNumber)
        setRegisterNo(issuedRegisterNo)
        window.setTimeout(() => printTransmittal(issuedRegisterNo), 50)
        return
      }
    } catch {}
  }

  return <Box sx={{ maxWidth: 1500, mx: 'auto', '@media print': { '& .transmittal-controls': { display: 'none !important' } } }}>
    <Paper className="transmittal-controls" variant="outlined" sx={{ width: { xs: '100%', sm: 'min(100%, 940px)' }, mx: 'auto', p: .75, mb: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(230px, 1fr) minmax(210px, 1fr) minmax(220px, .9fr)' }, gap: .75 }}>
      <FormControl fullWidth>
        <InputLabel shrink htmlFor="transmittal-report-date">Fecha del reporte</InputLabel>
        <OutlinedInput id="transmittal-report-date" label="Fecha del reporte" notched value={date ? formatDate(date) : 'Sin reportes diarios'} readOnly onClick={(event) => setDateAnchorEl(event.currentTarget)} sx={{ height: 42, cursor: 'pointer', '& input': { cursor: 'pointer', py: 1, fontSize: 14, fontWeight: 600, color: '#667085', textAlign: 'center' } }} />
      </FormControl>
      <FormControl fullWidth>
        <InputLabel shrink htmlFor="transmittal-delivery-date">Fecha de entrega</InputLabel>
        <OutlinedInput id="transmittal-delivery-date" type="date" label="Fecha de entrega" notched value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} sx={{ height: 42, '& input': { py: 1, fontSize: 14, fontWeight: 600, color: '#667085', textAlign: 'center' } }} />
      </FormControl>
      <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => void handlePrint()} disabled={!date || displayedDocuments.length === 0} sx={{ minHeight: 42, px: 1.5, fontSize: 13, fontWeight: 700, boxShadow: 'none', '&:hover': { boxShadow: 'none' } }}>Imprimir / Guardar PDF</Button>
      <Popover open={Boolean(dateAnchorEl)} anchorEl={dateAnchorEl} onClose={() => setDateAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <DateCalendar
            value={parseYmdToDate(date)}
            referenceDate={parseYmdToDate(date || availableDates[availableDates.length - 1] || '') || undefined}
            onChange={(next) => {
              const value = dateToYmd(next as Date | null)
              if (!allowedDateSet.has(value)) return
              setDate(value)
              setDateAnchorEl(null)
            }}
            shouldDisableDate={(day) => !allowedDateSet.has(dateToYmd(day as Date))}
          />
        </LocalizationProvider>
      </Popover>
    </Paper>
    <Paper id="transmittal-print" className="transmittal-sheet" square elevation={0} sx={{ '--transmittal-columns': '7fr 48fr 10fr 27fr 8fr', p: 0, border: '1px solid #111', borderRadius: 0, overflow: 'hidden', '@media print': { border: '1px solid #111', boxShadow: 'none' } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.05fr 1.35fr .42fr .52fr', borderBottom: '1px solid #111' }}>
        <Box sx={{ minHeight: 78, p: 1, borderRight: '1px solid #111', display: 'grid', placeItems: 'center' }}>{logoUrl ? <Box component="img" src={logoUrl} alt={companyName} sx={{ maxWidth: '58%', maxHeight: 52, objectFit: 'contain' }} /> : <Typography sx={{ fontWeight: 700, color: '#06306b', fontSize: 12 }}>{companyName}</Typography>}</Box>
        <Box className="transmittal-document-title" sx={{ minWidth: 0, p: 1.25, borderRight: '1px solid #111', display: 'grid', placeItems: 'center', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 700, color: '#06306b' }}>REGISTRO DE ENTREGA DE DOCUMENTOS</Box>
        <Box sx={{ p: 1.25, borderRight: '1px solid #111', display: 'grid', placeItems: 'center', textAlign: 'center', fontWeight: 700, fontSize: 12, color: '#06306b' }}>{formatHeaderDate(date)}</Box>
        <Box sx={{ display: 'grid', gridTemplateRows: '1fr auto' }}><Box sx={{ borderBottom: '1px solid #111' }} /><Box sx={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', bgcolor: '#c9c8f7', color: '#06306b', fontWeight: 700 }}><Box sx={{ p: .55, bgcolor: '#fff', borderRight: '1px solid #111', whiteSpace: 'nowrap', fontSize: 12 }}>N° REG:</Box><Box sx={{ p: .55, textAlign: 'center' }}>{displayedRegisterNo}</Box></Box></Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '.5fr 2.45fr .8fr .7fr 1.15fr .85fr', borderBottom: '1px solid #111', color: '#06306b', fontWeight: 700, fontSize: 11, '& > *': { minWidth: 0, borderRight: '1px solid #111', whiteSpace: 'nowrap' }, '& > :last-child': { borderRight: 0 } }}>
        <Box sx={{ p: .7, bgcolor: '#032a6a', color: '#fff' }}>Proyecto</Box><Box sx={{ p: .7 }}>{displayedProjectName}</Box><Box sx={{ p: .7, bgcolor: '#032a6a', color: '#fff' }}>Contrato</Box><Box sx={{ p: .7, textAlign: 'center' }}>{contractNo || '-'}</Box><Box sx={{ p: .7, bgcolor: '#032a6a', color: '#fff' }}>Fecha de Entrega:</Box><Box sx={{ p: .7, textAlign: 'center' }}>{formatShortDate(deliveryDate)}</Box>
      </Box>
      <Box sx={{ bgcolor: '#032a6a', color: '#fff', textAlign: 'center', py: .5, fontWeight: 700, fontSize: 12 }}>DATOS DE DOCUMENTOS A DISTRIBUIR</Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'var(--transmittal-columns)', bgcolor: '#f00', color: '#fff', fontWeight: 700, textAlign: 'center', '& > *': { minWidth: 0, minHeight: 25, px: .7, py: .35, borderRight: '1px solid #111', borderBottom: '1px solid #111', display: 'grid', placeItems: 'center' }, '& > :last-child': { borderRight: 0 } }}>
        <Box sx={{ whiteSpace: 'nowrap', fontSize: '9px !important', overflow: 'hidden' }}>N° doc</Box><Box>Nombre / Código</Box><Box>Especialidad</Box><Box>Comentario</Box><Box>Rev.</Box>
      </Box>
      {[...displayedDocuments, ...Array.from({ length: Math.max(0, 9 - displayedDocuments.length) }, () => null)].map((row, index) => (
        <Box key={row?.id || `blank-${index}`} sx={{ display: 'grid', gridTemplateColumns: 'var(--transmittal-columns)', color: '#06306b', '& > *': { minWidth: 0, minHeight: 23, px: .7, py: .35, borderRight: '1px solid #111', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center' }, '& > :last-child': { borderRight: 0 } }}>
          <Box sx={{ justifyContent: 'center', fontWeight: 700 }}>{row ? index + 1 : ''}</Box>
          <Box sx={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden' }}>{row?.name || ''}</Box>
          <Box sx={{ justifyContent: 'center', fontWeight: 700 }}>{row?.specialty || ''}</Box>
          <Box sx={{ fontWeight: 700 }}>{row?.comment || ''}</Box>
          <Box sx={{ justifyContent: 'center', fontWeight: 700 }}>{row?.revision || ''}</Box>
        </Box>
      ))}
      <Box sx={{ bgcolor: '#5889bd', color: '#fff', textAlign: 'center', py: .65, fontWeight: 700 }}>DATOS DESTINATARIOS DE DOCUMENTOS</Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '9fr 46fr 10fr 22fr 13fr', borderBottom: '1px solid #111', bgcolor: '#8d8d8d', color: '#06306b', fontWeight: 700, textAlign: 'center', '& > *': { minWidth: 0, minHeight: 30, p: .6, borderRight: '1px solid #111', display: 'grid', placeItems: 'center' }, '& > :last-child': { borderRight: 0, whiteSpace: 'nowrap' } }}><Box>N° DE DOCS</Box><Box>NOMBRE</Box><Box>USUARIO</Box><Box>FIRMA</Box><Box>FECHA RECEPCIÓN</Box></Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '9fr 46fr 10fr 22fr 13fr', minHeight: 88, '& > *': { minWidth: 0, p: .7, borderRight: '1px solid #111' }, '& > :last-child': { borderRight: 0 } }}><Box sx={{ bgcolor: '#fffec8', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{displayedDocuments.length}</Box><Box /><Box sx={{ bgcolor: '#fffec8' }} /><Box /><Box sx={{ bgcolor: '#fffec8' }} /></Box>
    </Paper>
    <Box className="transmittal-controls" sx={{ width: 'min(100%, 1180px)', mx: 'auto', mt: 1.25, pt: 1.25, borderTop: '1px solid #d8e2ef' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ color: '#0b2f5f', fontSize: 14, fontWeight: 700 }}>Documentos detectados</Typography>
        <Typography sx={{ color: '#63758d', fontSize: 12, fontWeight: 600 }}>{displayedDocuments.length} de 9 documentos</Typography>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .75 }}>
        {reports.map((row) => {
          const selected = Boolean(included[row.id])
          const label = row.document_name || `${row.work_front} N°${row.report_no}`
          return (
            <Button
              key={row.id}
              type="button"
              variant={selected ? 'contained' : 'outlined'}
              startIcon={<DescriptionOutlined />}
              onClick={() => setIncluded((prev) => ({ ...prev, [row.id]: !selected }))}
              aria-pressed={selected}
              title={selected ? 'Excluir del Transmittal' : 'Incluir en el Transmittal'}
              sx={{
                minHeight: 38,
                maxWidth: '100%',
                px: 1.25,
                borderRadius: 1,
                textTransform: 'none',
                textAlign: 'left',
                fontSize: 12.5,
                fontWeight: 700,
                lineHeight: 1.2,
                boxShadow: 'none',
                ...(selected
                  ? { bgcolor: '#075fc7', '&:hover': { bgcolor: '#064faa', boxShadow: 'none' } }
                  : { color: '#52647a', borderColor: '#b9c7d8', bgcolor: '#fff', '&:hover': { borderColor: '#075fc7', bgcolor: '#f2f7fd', boxShadow: 'none' } })
              }}
            >
              {label}
            </Button>
          )
        })}
      </Box>
      <Paper variant="outlined" sx={{ mt: 1.25, p: 1, borderRadius: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ color: '#0b2f5f', fontSize: 14, fontWeight: 700 }}>Editar documentos</Typography>
          <Button type="button" size="small" startIcon={<AddOutlined />} onClick={addManualDocument} disabled={displayedDocuments.length >= 9} sx={{ textTransform: 'none', fontWeight: 700 }}>Añadir documento</Button>
        </Stack>
        <Stack spacing={.75}>
          {displayedDocuments.map((row, index) => (
            <Box key={`editor-${row.id}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '34px minmax(260px, 3fr) minmax(110px, .8fr) minmax(150px, 1.4fr) minmax(90px, .7fr) 36px' }, gap: .75, alignItems: 'center' }}>
              <Typography sx={{ color: '#63758d', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{index + 1}</Typography>
              <OutlinedInput size="small" value={row.name} onChange={(event) => updateDocument(row.id, 'name', event.target.value)} placeholder="Nombre / Código" inputProps={{ 'aria-label': `Nombre del documento ${index + 1}` }} />
              <OutlinedInput size="small" value={row.specialty} onChange={(event) => updateDocument(row.id, 'specialty', event.target.value)} placeholder="Especialidad" inputProps={{ 'aria-label': `Especialidad del documento ${index + 1}` }} sx={{ '& input': { textAlign: 'center' } }} />
              <OutlinedInput size="small" value={row.comment} onChange={(event) => updateDocument(row.id, 'comment', event.target.value)} placeholder="Comentario" inputProps={{ 'aria-label': `Comentario del documento ${index + 1}` }} sx={{ '& input': { textAlign: 'center' } }} />
              <OutlinedInput size="small" value={row.revision} onChange={(event) => updateDocument(row.id, 'revision', event.target.value)} placeholder="Revisión" inputProps={{ 'aria-label': `Revisión del documento ${index + 1}` }} sx={{ '& input': { textAlign: 'center' } }} />
              {row.manual ? <Tooltip title="Eliminar documento"><IconButton size="small" color="error" onClick={() => setManualDocuments((current) => current.filter((item) => item.id !== row.id))} aria-label={`Eliminar documento ${index + 1}`}><DeleteOutline fontSize="small" /></IconButton></Tooltip> : <Box />}
            </Box>
          ))}
        </Stack>
      </Paper>
    </Box>
  </Box>
}
