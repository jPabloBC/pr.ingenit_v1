'use client'

import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Checkbox, FormControl, FormControlLabel, InputLabel, OutlinedInput, Paper, Popover, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { PrintOutlined } from '@mui/icons-material'
import { DateCalendar, LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { es } from 'date-fns/locale'
import { useSession } from 'next-auth/react'

type DailyReport = { id: string; report_no?: number; report_date?: string; work_front?: string }
const formatDate = (date: string) => date ? date.split('-').reverse().join('-') : ''
const formatShortDate = (date: string) => date ? `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(2, 4)}` : ''
const formatHeaderDate = (date: string) => date ? new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`)).replace(' ', '-') : ''
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

  const selectedReports = useMemo(() => reports.filter((row) => included[row.id]).slice(0, 9), [reports, included])
  const allowedDateSet = useMemo(() => new Set(availableDates), [availableDates])
  const displayedRegisterNo = useMemo(() => {
    if (registerNo) return registerNo
    const currentReportNo = Math.max(0, ...reports.map((row) => Number(row.report_no || 0)))
    return currentReportNo > 0 ? String(currentReportNo + 3) : '-'
  }, [registerNo, reports])
  const companyName = String(session?.user?.companyName || 'PUMA INGENIERÍA Y CONSTRUCCIÓN').toUpperCase()
  const displayedProjectName = projectName || companyName

  const handlePrint = async () => {
    try {
      if (!date || selectedReports.length === 0) return
      const response = await fetch('/api/transmittal-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportDate: date }) })
      const data = await response.json().catch(() => ({}))
      if (response.ok && Number.isFinite(Number(data?.registerNumber))) {
        setRegisterNo(String(data.registerNumber))
        window.setTimeout(() => window.print(), 50)
        return
      }
    } catch {}
  }

  return <Box sx={{ maxWidth: 1400, mx: 'auto', '@media print': { '& .transmittal-controls': { display: 'none !important' } } }}>
    <Paper className="transmittal-controls" variant="outlined" sx={{ width: 'min(100%, 940px)', mx: 'auto', p: 1, mb: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(250px, .85fr) minmax(300px, 1.15fr)' }, gap: 1 }}>
      <FormControl fullWidth>
        <InputLabel shrink htmlFor="transmittal-delivery-date">Fecha de entrega</InputLabel>
        <OutlinedInput id="transmittal-delivery-date" label="Fecha de entrega" notched value={date ? formatDate(date) : 'Sin reportes diarios'} readOnly onClick={(event) => setDateAnchorEl(event.currentTarget)} sx={{ height: 48, cursor: 'pointer', '& input': { cursor: 'pointer' } }} />
      </FormControl>
      <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => void handlePrint()} disabled={!date || selectedReports.length === 0} sx={{ minHeight: 48, fontSize: 15, fontWeight: 700 }}>Imprimir / Guardar PDF</Button>
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
    <Paper id="transmittal-print" className="transmittal-sheet" square elevation={0} sx={{ p: 0, border: '1px solid #111', borderRadius: 0, overflow: 'hidden', '@media print': { border: '1px solid #111', boxShadow: 'none' } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr .45fr .4fr', borderBottom: '1px solid #111' }}>
        <Box sx={{ minHeight: 78, p: 1, borderRight: '1px solid #111', display: 'grid', placeItems: 'center' }}>{logoUrl ? <Box component="img" src={logoUrl} alt={companyName} sx={{ maxWidth: '58%', maxHeight: 52, objectFit: 'contain' }} /> : <Typography sx={{ fontWeight: 700, color: '#06306b', fontSize: 12 }}>{companyName}</Typography>}</Box>
        <Box className="transmittal-document-title" sx={{ p: 1.25, borderRight: '1px solid #111', display: 'grid', placeItems: 'center', textAlign: 'center', fontWeight: 700, color: '#06306b' }}>REGISTRO DE ENTREGA DE DOCUMENTOS</Box>
        <Box sx={{ p: 1.25, borderRight: '1px solid #111', display: 'grid', placeItems: 'center', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>{formatHeaderDate(date)}</Box>
        <Box sx={{ display: 'grid', gridTemplateRows: '1fr auto' }}><Box sx={{ borderBottom: '1px solid #111' }} /><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', bgcolor: '#c9c8f7', color: '#062d6b', fontWeight: 700 }}><Box sx={{ p: .55, bgcolor: '#fff', borderRight: '1px solid #111', fontSize: 12 }}>N° REG:</Box><Box sx={{ p: .55, textAlign: 'center' }}>{displayedRegisterNo}</Box></Box></Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '.55fr 2fr .9fr .65fr 1fr .9fr', borderBottom: '1px solid #111', fontWeight: 700, fontSize: 11, '& > *': { borderRight: '1px solid #111' }, '& > :last-child': { borderRight: 0 } }}>
        <Box sx={{ p: .7, bgcolor: '#032a6a', color: '#fff' }}>Proyecto</Box><Box sx={{ p: .7 }}>{displayedProjectName}</Box><Box sx={{ p: .7, bgcolor: '#032a6a', color: '#fff' }}>Contrato</Box><Box sx={{ p: .7 }}>{contractNo || '-'}</Box><Box sx={{ p: .7, bgcolor: '#032a6a', color: '#fff' }}>Fecha de Entrega:</Box><Box sx={{ p: .7, textAlign: 'center' }}>{formatShortDate(date)}</Box>
      </Box>
      <Box sx={{ bgcolor: '#032a6a', color: '#fff', textAlign: 'center', py: .5, fontWeight: 700, fontSize: 12 }}>DATOS DE DOCUMENTOS A DISTRIBUIR</Box>
      <Table size="small" sx={{ tableLayout: 'fixed', border: 0, '& td, & th': { border: 0, borderRight: '1px solid #111', borderBottom: '1px solid #111', py: .35, fontSize: 10.5 }, '& td:last-child, & th:last-child': { borderRight: 0 }, '& tbody tr': { height: 23 } }}><TableHead><TableRow sx={{ bgcolor: '#f00' }}><TableCell align="center" sx={{ width: '7%', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '9px !important', overflow: 'hidden' }}>N° doc</TableCell><TableCell align="center" sx={{ width: '32%', color: '#fff', fontWeight: 700 }}>Nombre / Código</TableCell><TableCell align="center" sx={{ width: '10%', color: '#fff', fontWeight: 700 }}>Especialidad</TableCell><TableCell align="center" sx={{ width: '43%', color: '#fff', fontWeight: 700 }}>Comentario</TableCell><TableCell align="center" sx={{ width: '8%', color: '#fff', fontWeight: 700 }}>Rev.</TableCell></TableRow></TableHead><TableBody>{selectedReports.map((row, index) => <TableRow key={row.id}><TableCell align="center" sx={{ fontWeight: 700 }}>{index + 1}</TableCell><TableCell sx={{ fontWeight: 700 }}>Daily Report {String(row.work_front || '')} N°{String(row.report_no || '').padStart(3, '0')}</TableCell><TableCell align="center" sx={{ fontWeight: 700 }}>OTEC</TableCell><TableCell sx={{ fontWeight: 700 }}>Físico</TableCell><TableCell align="center" sx={{ fontWeight: 700 }}>Rev.0</TableCell></TableRow>)}{Array.from({ length: Math.max(0, 9 - selectedReports.length) }).map((_, i) => <TableRow key={`blank-${i}`}><TableCell align="center" /><TableCell /><TableCell /><TableCell /><TableCell /></TableRow>)}</TableBody></Table>
      <Box sx={{ bgcolor: '#5889bd', color: '#fff', textAlign: 'center', py: .65, fontWeight: 700 }}>DATOS DESTINATARIOS DE DOCUMENTOS</Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, .8fr) minmax(0, 4.5fr) minmax(0, .55fr) minmax(0, 2fr) minmax(0, 1.2fr)', borderBottom: '1px solid #111', bgcolor: '#8d8d8d', color: '#062d6b', fontWeight: 700, textAlign: 'center', '& > *': { minWidth: 0, p: .6, borderRight: '1px solid #111' }, '& > :last-child': { borderRight: 0 } }}><Box>N° DE DOCS</Box><Box>NOMBRE</Box><Box>USUARIO</Box><Box>FIRMA</Box><Box>FECHA RECEPCIÓN</Box></Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, .8fr) minmax(0, 4.5fr) minmax(0, .55fr) minmax(0, 2fr) minmax(0, 1.2fr)', minHeight: 88, '& > *': { minWidth: 0, p: .7, borderRight: '1px solid #111' }, '& > :last-child': { borderRight: 0 } }}><Box sx={{ bgcolor: '#fffec8', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{selectedReports.length}</Box><Box /><Box sx={{ bgcolor: '#fffec8' }} /><Box /><Box sx={{ bgcolor: '#fffec8' }} /></Box>
    </Paper>
    <Stack className="transmittal-controls" direction="row" spacing={1} sx={{ width: 'min(100%, 940px)', mx: 'auto', mt: 1, flexWrap: 'wrap' }}><Typography variant="body2">Documentos detectados:</Typography>{reports.map((row) => <FormControlLabel key={row.id} control={<Checkbox checked={Boolean(included[row.id])} onChange={(e) => setIncluded((prev) => ({ ...prev, [row.id]: e.target.checked }))} />} label={`${row.work_front} N°${row.report_no}`} />)}</Stack>
  </Box>
}
