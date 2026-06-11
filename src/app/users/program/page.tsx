"use client"

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Container, Typography, Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem, TextField, InputAdornment, IconButton, Tooltip, LinearProgress } from '@mui/material'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import KeyboardArrowLeftRoundedIcon from '@mui/icons-material/KeyboardArrowLeftRounded'
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded'
import UserHeader from '../../../components/layout/UserHeader'
import { colors } from '../../../theme/theme'

export default function ProgramPage() {
  const router = useRouter()
  const programActivitiesApiUrl = '/api/activities?exclude_crew_created=1'

  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [programSearch, setProgramSearch] = useState('')
  const [programView, setProgramView] = useState<'tree' | 'table'>('tree')
  const [showTreeBreakdown, setShowTreeBreakdown] = useState(false)
  const [showTreeMappingColumns, setShowTreeMappingColumns] = useState(false)
  const [movingTreeId, setMovingTreeId] = useState<string | null>(null)

  // form fields
  const [fItemId, setFItemId] = useState('')
  const [fSubId, setFSubId] = useState('')
  const [fArea, setFArea] = useState('')
  const [fDiscipline, setFDiscipline] = useState('')
  const [fActivity, setFActivity] = useState('')
  const [fPackage, setFPackage] = useState('')
  const [fDescription, setFDescription] = useState('')
  const [fUnit, setFUnit] = useState('')
  const [fQuantity, setFQuantity] = useState<number | ''>('')
  const [fCrewId, setFCrewId] = useState<string | null>(null)
  const [fObservations, setFObservations] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importSheetNames, setImportSheetNames] = useState<string[]>([])
  const [selectedImportSheet, setSelectedImportSheet] = useState<string>('')
  const [parsedSheetsByName, setParsedSheetsByName] = useState<Record<string, any[][]>>({})
  const [parsedAoa, setParsedAoa] = useState<any[][] | null>(null)
  const [parsedRows, setParsedRows] = useState<any[] | null>(null)
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(1)
  const [mappingModalOpen, setMappingModalOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importProgressLabel, setImportProgressLabel] = useState('')
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([])
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({})

  const resetForm = () => {
    setEditingId(null)
    setFItemId('')
    setFSubId('')
    setFArea('')
    setFDiscipline('')
    setFActivity('')
    setFPackage('')
    setFDescription('')
    setFUnit('')
    setFQuantity('')
    setFCrewId(null)
    setFObservations('')
  }

  const handleSaveActivity = async () => {
    try {
      const payload = {
        item_id: fItemId || null,
        sub_id: fSubId || null,
        discipline: fDiscipline || null,
        area: fArea,
        activity: fActivity,
        package: fPackage,
        description: fDescription,
        unit: fUnit,
        quantity: fQuantity === '' ? null : fQuantity,
        observations: fObservations,
      }

      if (editingId) {
        const res = await fetch(`/api/activities/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('Update failed')
      } else {
        const res = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, activity_origin: 'program' })
        })
        if (!res.ok) throw new Error('Create failed')
      }

      // reload
      const r = await fetch(programActivitiesApiUrl)
      const data = await r.json()
      setActivities(data || [])
      resetForm()
      setShowForm(false)
    } catch (err) {
      console.error(err)
      alert('Error saving activity')
    }
  }

  const handleEdit = (a: any) => {
    setEditingId(a.id)
    setFItemId(a.item_id || '')
    setFSubId(a.sub_id || '')
    setFArea(a.area || '')
    setFDiscipline(a.discipline || '')
    setFActivity(a.activity || '')
    setFPackage(a.package || '')
    setFDescription(a.description || '')
    setFUnit(a.unit || '')
    setFQuantity(a.quantity ?? '')
    setFObservations(a.observations || '')
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar actividad?')) return
    const res = await fetch(`/api/activities/${id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error eliminando'); return }
    setActivities((s) => s.filter((x) => x.id !== id))
  }

  const buildActivityPayload = (a: any, patch: Record<string, any> = {}) => ({
    item_id: a?.item_id || null,
    sub_id: a?.sub_id || null,
    discipline: a?.discipline || null,
    area: a?.area || null,
    activity: a?.activity || null,
    package: a?.package || null,
    description: a?.description || null,
    tree_level_1: a?.tree_level_1 || null,
    tree_level_2: a?.tree_level_2 || null,
    tree_level_3: a?.tree_level_3 || null,
    tree_level_4: a?.tree_level_4 || null,
    tree_level_5: a?.tree_level_5 || null,
    tree_path: a?.tree_path || null,
    unit: a?.unit || null,
    quantity: a?.quantity ?? null,
    observations: a?.observations || null,
    ...patch,
  })

  const moveTreeLevel = async (a: any, direction: -1 | 1) => {
    const levels = [
      normalizeImportText(a?.tree_level_1 || ''),
      normalizeImportText(a?.tree_level_2 || ''),
      normalizeImportText(a?.tree_level_3 || ''),
      normalizeImportText(a?.tree_level_4 || ''),
      normalizeImportText(a?.tree_level_5 || ''),
    ]

    let idx = levels.findIndex((x) => !!x)
    if (idx < 0) return
    const nextIdx = Math.max(0, Math.min(4, idx + direction))
    if (nextIdx === idx) return

    const value = levels[idx]
    levels[idx] = ''
    levels[nextIdx] = value

    const patch = {
      tree_level_1: levels[0] || null,
      tree_level_2: levels[1] || null,
      tree_level_3: levels[2] || null,
      tree_level_4: levels[3] || null,
      tree_level_5: levels[4] || null,
      tree_path: levels.filter(Boolean).join(' > ') || null,
    }

    try {
      setMovingTreeId(String(a.id))
      const res = await fetch(`/api/activities/${a.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildActivityPayload(a, patch)),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || 'No se pudo mover el árbol')
      }
      const updated = await res.json()
      setActivities((prev) => prev.map((row) => (row.id === a.id ? updated : row)))
    } catch (err) {
      console.error(err)
      alert(`No se pudo mover en árbol: ${(err as Error)?.message || 'Error desconocido'}`)
    } finally {
      setMovingTreeId(null)
    }
  }

  const parseCsvAoa = (text: string) => {
    const lines = String(text || '').split(/\r?\n/)
    const matrix = lines.map((line) => line.split(',').map((c) => String(c ?? '').trim()))
    return matrix
  }

  const normalizeImportText = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
  const normalizeImportKey = (s: string) =>
    (s || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  const computeAutoMapping = (hdrs: string[]) => {
    const map: Record<string, string> = {}
    const find = (cands: string[]) => {
      for (const c of cands) {
        const f = hdrs.find(h => normalizeImportKey(h) === normalizeImportKey(c))
        if (f) return f
      }
      return ''
    }
    map.item_id = find(['item_id', 'id', 'ID', 'Id', 'itemid', 'codigo', 'código'])
    map.sub_id = find(['sub_id', 'sub-id', 'subid', 'Sub-ID', 'SubId', 'subarea', 'sub_area', 'sub-área', 'frente', 'tramo'])
    map.area = find(['area', 'área', 'Area'])
    map.activity = find(['activity', 'actividad', 'Actividad', 'nombre'])
    map.package = find(['package', 'paquete', 'Paquete'])
    map.discipline = find(['discipline', 'disciplina', 'Disciplina'])
    map.description = find(['description', 'descripción', 'descripcion', 'Descripcion', 'detalle'])
    map.unit = find(['unit', 'unidad', 'Unidad'])
    map.quantity = find(['quantity', 'cantidad', 'Cantidad'])
    map.observations = find(['observations', 'observaciones', 'Observaciones'])
    return map
  }

  const buildRowsFromAoa = (aoa: any[][], headerRow: number) => {
    if (!Array.isArray(aoa) || aoa.length === 0) return { rows: [] as any[], headers: [] as string[] }
    const headerIndex = Math.min(Math.max(Number(headerRow || 1) - 1, 0), aoa.length - 1)
    const rawHeaders = (aoa[headerIndex] || []).map((h: any) => normalizeImportText(h))
    const uniqueHeaders: string[] = []
    const seen = new Map<string, number>()
    rawHeaders.forEach((h, idx) => {
      const base = h || `COL_${idx + 1}`
      const prev = seen.get(base) || 0
      seen.set(base, prev + 1)
      uniqueHeaders.push(prev === 0 ? base : `${base}_${prev + 1}`)
    })

    const rows = aoa
      .slice(headerIndex + 1)
      .map((line: any[]) => {
        const obj: any = {}
        uniqueHeaders.forEach((h, i) => {
          obj[h] = line && line[i] !== undefined ? normalizeImportText(line[i]) : null
        })
        return obj
      })
      .filter((obj: any) => Object.values(obj).some((v) => normalizeImportText(v) !== ''))

    return { rows, headers: uniqueHeaders }
  }

  const applyHeaderSelection = (aoa: any[][], headerRow: number) => {
    const { rows, headers } = buildRowsFromAoa(aoa, headerRow)
    setParsedRows(rows)
    setAvailableHeaders(headers)
    setFieldMapping(computeAutoMapping(headers))
  }
  const isLikelyProgramCode = (raw: string) => {
    const v = normalizeImportText(raw).toUpperCase()
    if (!v) return false
    if (/^[A-Z]\d{3,}$/.test(v)) return true // A1100
    if (/^[A-Z]?\d+(?:[.-][A-Z0-9]+)+$/.test(v)) return true // T1.A001
    if (/^[A-Z0-9]+(?:\.[A-Z0-9]+)+$/.test(v)) return true
    return false
  }
  const isLikelySectionLabel = (raw: string) => {
    const v = normalizeImportText(raw)
    if (!v) return true
    const n = normalizeImportKey(v)
    if (!n) return true
    if (isLikelyProgramCode(v)) return false
    const hasDigits = /\d/.test(v)
    if (!hasDigits && v === v.toUpperCase() && v.length >= 8) return true
    if (/^(programa|actividades|construccion|tramo|frente|instalacion|servicio)\b/i.test(v)) return true
    return false
  }

  const inferDisciplineFromText = (raw: string): string | null => {
    const text = normalizeImportText(raw)
    if (!text) return null
    const n = normalizeImportKey(text)
    if (!n) return null
    // Strict mode: only accept discipline when the cell is the discipline itself,
    // not when mixed inside longer phrases.
    const strictMap: Record<string, string> = {
      civil: 'Civil',
      mecanica: 'Mecánica',
      mecanico: 'Mecánica',
      mecanicos: 'Mecánica',
      electrico: 'Eléctrico',
      electrica: 'Eléctrico',
      electricidad: 'Eléctrico',
      instrumentacion: 'Instrumentación',
      caneria: 'Cañería',
      piping: 'Cañería',
      tuberia: 'Cañería',
      soldadura: 'Soldadura',
    }
    if (strictMap[n]) return strictMap[n]
    return null
  }

  const buildMappedRows = (
    sourceRows: any[],
    headers: string[],
    mapping: Record<string, string>
  ) => {
    const findHeader = (field: string) => {
      if (mapping[field]) return mapping[field]
      const normField = normalizeImportKey(field)
      const found = headers.find(h => normalizeImportKey(h) === normField)
      if (found) return found
      const alt = {
        item_id: ['id', 'itemid'],
        sub_id: ['subid', 'sub-id', 'sub_id'],
        area: ['area', 'área'],
        activity: ['activity', 'actividad'],
        package: ['package', 'paquete'],
        discipline: ['discipline', 'disciplina'],
        description: ['description', 'descripción', 'descripcion'],
        tree_level_1: ['tree_level_1', 'arbol_1', 'árbol_1', 'nivel_1', 'nivel1'],
        tree_level_2: ['tree_level_2', 'arbol_2', 'árbol_2', 'nivel_2', 'nivel2'],
        tree_level_3: ['tree_level_3', 'arbol_3', 'árbol_3', 'nivel_3', 'nivel3'],
        tree_level_4: ['tree_level_4', 'arbol_4', 'árbol_4', 'nivel_4', 'nivel4'],
        tree_level_5: ['tree_level_5', 'arbol_5', 'árbol_5', 'nivel_5', 'nivel5'],
        tree_path: ['tree_path', 'ruta_arbol', 'rutaárbol', 'ruta'],
        unit: ['unit', 'unidad'],
        quantity: ['quantity', 'cantidad'],
        observations: ['observations', 'observaciones'],
      } as Record<string, string[]>
      for (const a of alt[field] || []) {
        const f = headers.find(h => normalizeImportKey(h) === normalizeImportKey(a))
        if (f) return f
      }
      return ''
    }

    const getVal = (p: any, field: string) => {
      const h = findHeader(field)
      if (h) return p[h]
      if (field === 'item_id') return p.item_id || p.ID || p.Id || null
      if (field === 'sub_id') return p.sub_id || p['Sub-ID'] || p.SubId || null
      if (field === 'quantity') return p.quantity || p.Cantidad || null
      return p[field] ?? null
    }

    const normalizeCode = (raw: unknown) => {
      const v = normalizeImportText(raw).toUpperCase()
      return v && isLikelyProgramCode(v) ? v : ''
    }

    const parseQuantity = (raw: unknown) => {
      if (raw == null || raw === '') return null
      const n = Number(String(raw).replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    const isLikelyContextLabel = (raw: string) => {
      const v = normalizeImportText(raw)
      if (!v) return false
      if (isLikelyProgramCode(v)) return false
      if (/^\d+(?:[.,]\d+)?$/.test(v)) return false
      if (/^(id|itemid|subid|sub-id|area|actividad|paquete|disciplina|descripcion|descripción|unidad|cantidad|observaciones)$/i.test(v)) return false
      if (/^(actividades previas|actividad)$/i.test(v)) return false
      if (/^(programa|servicio|construccion|construcción|tramo|frente|instalacion|instalación|accesos|limpieza|mecanica|mecánica|civil)$/i.test(v)) return true
      return !/\d/.test(v) || isLikelySectionLabel(v)
    }

    const itemHeader = findHeader('item_id')
    const activityHeader = findHeader('activity')
    const sameMixedColumn = !!itemHeader && !!activityHeader && itemHeader === activityHeader

    const inferPairs = new Map<number, { item_id?: string; activity?: string }>()
    const inferredDisciplineByRow = new Map<number, string>()
    const contextByRow = new Map<number, string[]>()
    let pendingCode: { rowIndex: number; code: string } | null = null
    let currentDisciplineContext: string | null = null
    let contextTrail: string[] = []
    const rowValuesByIndex: string[][] = sourceRows.map((row: any) =>
      Object.values(row || {})
        .map((v) => normalizeImportText(v))
        .filter(Boolean)
    )

    const pushContext = (label: string) => {
      const text = normalizeImportText(label)
      if (!text || !isLikelyContextLabel(text)) return
      const key = normalizeImportKey(text)
      contextTrail = contextTrail.filter((x) => normalizeImportKey(x) !== key)
      contextTrail.push(text)
      if (contextTrail.length > 4) contextTrail = contextTrail.slice(-4)
    }

    sourceRows.forEach((row: any, rowIndex: number) => {
      const explicitDiscipline = normalizeImportText(getVal(row, 'discipline'))
      const explicitDisciplineInferred = inferDisciplineFromText(explicitDiscipline)
      if (explicitDisciplineInferred) {
        currentDisciplineContext = explicitDisciplineInferred
      }

      const rowValues = rowValuesByIndex[rowIndex] || []
      const rawQuantity = getVal(row, 'quantity')
      const rowQuantity = parseQuantity(rawQuantity)
      const rowUnit = normalizeImportText(getVal(row, 'unit'))

      if (rowValues.length === 0) return

      const rowDiscipline = rowValues
        .map((txt) => inferDisciplineFromText(txt))
        .find((d): d is string => !!d) || null
      if (rowDiscipline) currentDisciplineContext = rowDiscipline

      const rowHasCode = rowValues.some((txt) => isLikelyProgramCode(txt))
      const rowHasOperationalSignal = rowHasCode || rowQuantity !== null || !!rowUnit

      // Captura "árbol" de contexto desde filas descriptivas (sin métricas ni código)
      if (!rowHasOperationalSignal) {
        rowValues
          .filter((txt) => isLikelyContextLabel(txt))
          .forEach((txt) => pushContext(txt))
      }

      if (rowHasCode && contextTrail.length > 0) {
        contextByRow.set(rowIndex, [...contextTrail])
      }

      // Caso: código y actividad en la misma celda (ej: T1.A001 - Reparación ...)
      const inline = rowValues
        .map((txt) => txt.match(/^([A-Z]?\d+(?:[.-][A-Z0-9]+)+|[A-Z]\d{3,})\s*[-:|]\s*(.+)$/i))
        .find(Boolean)
      if (inline) {
        inferPairs.set(rowIndex, {
          item_id: normalizeImportText(inline[1]).toUpperCase(),
          activity: normalizeImportText(inline[2]),
        })
        if (currentDisciplineContext) inferredDisciplineByRow.set(rowIndex, currentDisciplineContext)
        pendingCode = null
        return
      }

      // Caso: código en una columna y actividad en otra columna de la misma fila
      const codeCell = rowValues.find((txt) => isLikelyProgramCode(txt))
      const activityCell = rowValues.find((txt) => !isLikelyProgramCode(txt) && !isLikelySectionLabel(txt))
      if (codeCell) {
        if (activityCell) {
          inferPairs.set(rowIndex, {
            item_id: codeCell.toUpperCase(),
            activity: activityCell,
          })
          if (currentDisciplineContext) inferredDisciplineByRow.set(rowIndex, currentDisciplineContext)
          pendingCode = null
          return
        }
        pendingCode = { rowIndex, code: codeCell.toUpperCase() }
        if (currentDisciplineContext) inferredDisciplineByRow.set(rowIndex, currentDisciplineContext)
        return
      }

      // Caso: código en fila anterior y actividad en esta fila
      if (pendingCode && activityCell) {
        inferPairs.set(pendingCode.rowIndex, {
          item_id: pendingCode.code,
          activity: activityCell,
        })
        if (currentDisciplineContext) inferredDisciplineByRow.set(pendingCode.rowIndex, currentDisciplineContext)
        pendingCode = null
      }
    })

    const getNearestDisciplineAbove = (rowIndex: number) => {
      for (let i = rowIndex; i >= 0; i -= 1) {
        const vals = rowValuesByIndex[i] || []
        for (const txt of vals) {
          const d = inferDisciplineFromText(txt)
          if (d) return d
        }
      }
      return null
    }

    const mapped = sourceRows.map((p: any, index: number) => {
      const inferred = inferPairs.get(index) || {}
      const rawItem = normalizeImportText(getVal(p, 'item_id'))
      const rawActivity = normalizeImportText(getVal(p, 'activity'))
      const rawQuantity = getVal(p, 'quantity')
      const quantity = parseQuantity(rawQuantity)
      const disciplineFromRow = normalizeImportText(getVal(p, 'discipline'))
      const disciplineInferred =
        disciplineFromRow ||
        inferredDisciplineByRow.get(index) ||
        getNearestDisciplineAbove(index) ||
        ''
      const itemId = normalizeCode(rawItem || inferred.item_id || '')
      const context = contextByRow.get(index) || []
      const contextTree = context.join(' > ')
      // Si en la columna ID viene texto (no código real), conservarlo como fila de árbol.
      const rawItemAsTree = rawItem && !itemId ? rawItem : ''
      let activity = normalizeImportText(rawActivity || inferred.activity || '')
      if (activity && isLikelyProgramCode(activity)) activity = ''
      const explicitTreeLevel1 = normalizeImportText(getVal(p, 'tree_level_1'))
      const explicitTreeLevel2 = normalizeImportText(getVal(p, 'tree_level_2'))
      const explicitTreeLevel3 = normalizeImportText(getVal(p, 'tree_level_3'))
      const explicitTreeLevel4 = normalizeImportText(getVal(p, 'tree_level_4'))
      const explicitTreeLevel5 = normalizeImportText(getVal(p, 'tree_level_5'))
      const explicitTreePath = normalizeImportText(getVal(p, 'tree_path'))
      const explicitLevels = [
        explicitTreeLevel1,
        explicitTreeLevel2,
        explicitTreeLevel3,
        explicitTreeLevel4,
        explicitTreeLevel5,
      ].filter(Boolean)
      const treeLevel1 = explicitTreeLevel1 || rawItemAsTree
      const treeLevel2 = explicitTreeLevel2
      const treeLevel3 = explicitTreeLevel3
      const treeLevel4 = explicitTreeLevel4
      const treeLevel5 = explicitTreeLevel5
      // No arrastrar contexto automático a filas con ID real:
      // el árbol debe reflejar solo lo explícito de la fila o el texto no-ID de esa misma fila.
      const treePath = explicitTreePath || (explicitLevels.join(' > ')) || rawItemAsTree

      const row = {
        item_id: itemId,
        sub_id: normalizeImportText(getVal(p, 'sub_id')),
        area: normalizeImportText(getVal(p, 'area')),
        activity,
        package: normalizeImportText(getVal(p, 'package')),
        discipline: normalizeImportText(disciplineInferred),
        description: normalizeImportText(getVal(p, 'description')),
        tree_path: treePath,
        tree_level_1: treeLevel1 || rawItemAsTree,
        tree_level_2: treeLevel2,
        tree_level_3: treeLevel3,
        tree_level_4: treeLevel4,
        tree_level_5: treeLevel5,
        unit: normalizeImportText(getVal(p, 'unit')),
        quantity,
        observations: normalizeImportText(getVal(p, 'observations')),
      }

      // Caso típico de columna mixta: no dejar "actividad = código" si no trae texto útil
      if (sameMixedColumn && row.activity && isLikelyProgramCode(row.activity) && !row.description) {
        row.activity = ''
      }

      return row
    })

    return mapped.filter((r) => {
      const hasAny = Object.values(r).some((v) => v !== null && normalizeImportText(v) !== '')
      if (!hasAny) return false
      const hasCode = !!r.item_id
      const hasQty = r.quantity !== null && r.quantity !== undefined
      const hasUnit = !!normalizeImportText(r.unit)
      const hasActivity = !!normalizeImportText(r.activity) && !isLikelySectionLabel(r.activity)
      const hasTree =
        !!normalizeImportText(r.tree_level_1) ||
        !!normalizeImportText(r.tree_level_2) ||
        !!normalizeImportText(r.tree_level_3) ||
        !!normalizeImportText(r.tree_level_4) ||
        !!normalizeImportText(r.tree_level_5) ||
        !!normalizeImportText(r.tree_path)
      if (!hasCode && !hasQty && !hasUnit && !hasActivity && !hasTree) return false
      if (!r.item_id && r.activity && isLikelySectionLabel(r.activity) && !hasTree) return false
      return true
    })
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const name = f.name || ''
    const lower = name.toLowerCase()

    let aoa: any[][] = []
    let sheetNames: string[] = []
    const sheetsMap: Record<string, any[][]> = {}

    // If file looks like Excel, try SheetJS; otherwise parse as CSV
    if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || f.type.includes('spreadsheet')) {
      try {
        const arrayBuffer = await f.arrayBuffer()
        const XLSX = await import('xlsx').then(m => m.default || m).catch(() => null)
        if (XLSX) {
          const workbook = XLSX.read(arrayBuffer, { type: 'array' })
          sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : []
          sheetNames.forEach((sheetName: string) => {
            const sheet = workbook.Sheets[sheetName]
            const sheetAoa = (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][])
              .map((r: any[]) => (Array.isArray(r) ? r.map((c: any) => normalizeImportText(c)) : []))
            sheetsMap[sheetName] = sheetAoa
          })
          const firstSheetName = sheetNames[0] || ''
          aoa = firstSheetName ? (sheetsMap[firstSheetName] || []) : []
        } else {
          const text = await f.text()
          aoa = parseCsvAoa(text)
          sheetNames = ['CSV']
          sheetsMap.CSV = aoa
        }
      } catch (err) {
        console.warn('Error parsing excel file, falling back to CSV parse', err)
        const text = await f.text()
        aoa = parseCsvAoa(text)
        sheetNames = ['CSV']
        sheetsMap.CSV = aoa
      }
    } else {
      const text = await f.text()
      aoa = parseCsvAoa(text)
      sheetNames = ['CSV']
      sheetsMap.CSV = aoa
    }

    const hasAnyData = aoa.some((row: any[]) => Array.isArray(row) && row.some((c: any) => normalizeImportText(c) !== ''))
    if (!hasAnyData) return alert('Archivo vacío o inválido')
    setImportSheetNames(sheetNames)
    const initialSheet = sheetNames[0] || 'CSV'
    setSelectedImportSheet(initialSheet)
    setParsedSheetsByName(sheetsMap)
    setParsedAoa(aoa)
    setHeaderRowNumber(1)
    applyHeaderSelection(aoa, 1)
    setMappingModalOpen(true)
  }

  const applyMappingAndImport = async () => {
    if (!parsedRows) return
    const mapped = buildMappedRows(parsedRows, availableHeaders, fieldMapping)
    if (mapped.length === 0) {
      alert('No se detectaron filas válidas para importar. Revisa el mapeo.')
      return
    }
    if (isImporting) return
    let progressTimer: ReturnType<typeof setInterval> | null = null
    try {
      setIsImporting(true)
      setImportProgress(8)
      setImportProgressLabel('Preparando importación...')
      progressTimer = setInterval(() => {
        setImportProgress((prev) => (prev >= 85 ? prev : prev + 4))
      }, 350)
      setImportProgressLabel('Importando al servidor...')
      const res = await fetch('/api/activities/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mapped) })
      setImportProgress(90)
      setImportProgressLabel('Procesando respuesta...')
      const raw = await res.text()
      let parsed: any = null
      try {
        parsed = raw ? JSON.parse(raw) : null
      } catch {
        parsed = null
      }

      if (!res.ok) {
        const msg =
          parsed?.error ||
          parsed?.message ||
          raw ||
          `Import failed (${res.status})`
        throw new Error(msg)
      }

      const inserted = Array.isArray(parsed) ? parsed.length : 0
      const listRes = await fetch(programActivitiesApiUrl)
      setImportProgress(96)
      setImportProgressLabel('Actualizando lista...')
      if (listRes.ok) {
        const list = await listRes.json()
        setActivities(Array.isArray(list) ? list : [])
      }
      setImportProgress(100)
      setImportProgressLabel('Importación completada')
      alert(`Importación completada (${inserted} filas).`)
      setMappingModalOpen(false)
      setImportSheetNames([])
      setSelectedImportSheet('')
      setParsedSheetsByName({})
      setParsedAoa(null)
      setParsedRows(null)
    } catch (err) {
      console.error(err)
      alert(`Importación fallida: ${(err as Error)?.message || 'Error desconocido'}`)
    } finally {
      if (progressTimer) clearInterval(progressTimer)
      setIsImporting(false)
      setTimeout(() => {
        setImportProgress(0)
        setImportProgressLabel('')
      }, 350)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(programActivitiesApiUrl)
        if (res.ok) {
          const data = await res.json()
          setActivities(data || [])
        }
      } catch (e) {
        console.warn('Could not load activities', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const mappedPreview = parsedRows ? buildMappedRows(parsedRows, availableHeaders, fieldMapping).slice(0, 30) : []
  const filteredActivities = useMemo(() => {
    const q = normalizeImportKey(programSearch)
    if (!q) return activities
    return (activities || []).filter((a: any) => {
      const bag = [
        a?.item_id,
        a?.sub_id,
        a?.area,
        a?.discipline,
        a?.activity,
        a?.package,
        a?.quantity,
        a?.unit,
        a?.observations,
        a?.description,
        a?.tree_level_1,
        a?.tree_level_2,
        a?.tree_level_3,
        a?.tree_level_4,
        a?.tree_level_5,
        a?.tree_path,
      ]
        .map((v) => normalizeImportKey(String(v ?? '')))
        .join(' ')
      return bag.includes(q)
    })
  }, [activities, programSearch])

  type TreeNode = {
    key: string
    label: string
    children: Map<string, TreeNode>
    activities: any[]
  }
  type TreeDisplayRow =
    | { kind: 'node'; key: string; depth: number; label: string }
    | { kind: 'activity'; key: string; depth: number; activity: any }

  const treeRows = useMemo<TreeDisplayRow[]>(() => {
    const roots = new Map<string, TreeNode>()
    const toKey = (v: string) => normalizeImportKey(v) || v.toLowerCase()
    const normalizeParts = (raw: unknown) =>
      String(raw ?? '')
        .split('>')
        .map((x) => normalizeImportText(x))
        .filter(Boolean)

    const buildPath = (a: any): string[] => {
      const byTree = [a?.tree_level_1, a?.tree_level_2, a?.tree_level_3, a?.tree_level_4, a?.tree_level_5]
        .map((x) => normalizeImportText(x))
        .filter(Boolean)
      if (byTree.length > 0) return byTree

      const byTreePathRaw = normalizeImportText(a?.tree_path || '')
      const byTreePath = byTreePathRaw.includes('>') ? normalizeParts(byTreePathRaw) : []
      if (byTreePath.length > 0) return byTreePath

      const byDescRaw = normalizeImportText(a?.description || '')
      const byDesc = byDescRaw.includes('>') ? normalizeParts(byDescRaw) : []
      const byCols = [a?.area, a?.package, a?.discipline]
        .map((x) => normalizeImportText(x))
        .filter(Boolean)
      const candidate = byDesc.length > 0 ? byDesc : byCols
      const cleaned = candidate.filter((part) => {
        const key = normalizeImportKey(part)
        if (!key) return false
        if (isLikelyProgramCode(part)) return false
        if (normalizeImportKey(a?.activity || '') === key) return false
        return true
      })
      return cleaned.length > 0 ? cleaned.slice(0, 5) : ['SIN CONTEXTO']
    }

    for (const act of filteredActivities) {
      const path = buildPath(act)
      let current = roots
      let parentPath = ''
      path.forEach((label, idx) => {
        const nodeKey = `${parentPath}/${toKey(label)}`
        if (!current.has(nodeKey)) {
          current.set(nodeKey, { key: nodeKey, label, children: new Map<string, TreeNode>(), activities: [] })
        }
        const node = current.get(nodeKey)!
        if (idx === path.length - 1) {
          node.activities.push(act)
        }
        current = node.children
        parentPath = nodeKey
      })
    }

    const out: TreeDisplayRow[] = []
    const walk = (nodes: Map<string, TreeNode>, depth: number) => {
      for (const node of nodes.values()) {
        out.push({ kind: 'node', key: `n-${node.key}`, depth, label: node.label })
        if (node.activities.length > 0) {
          node.activities.forEach((activity: any, idx: number) => {
            out.push({
              kind: 'activity',
              key: `a-${node.key}-${activity.id || activity.item_id || idx}`,
              depth: depth + 1,
              activity,
            })
          })
        }
        walk(node.children, depth + 1)
      }
    }
    walk(roots, 0)
    return out
  }, [filteredActivities])

  const getTreeSummary = (a: any) => {
    const levels = [a?.tree_level_1, a?.tree_level_2, a?.tree_level_3, a?.tree_level_4, a?.tree_level_5]
      .map((x) => normalizeImportText(x))
      .filter(Boolean)
    if (levels.length > 0) return levels.join(' > ')
    const path = normalizeImportText(a?.tree_path || '')
    if (path) return path
    return '-'
  }

  const getActivityDisplay = (a: any) => {
    const activity = normalizeImportText(a?.activity || '')
    const hasTreeData =
      !!normalizeImportText(a?.tree_level_1 || '') ||
      !!normalizeImportText(a?.tree_level_2 || '') ||
      !!normalizeImportText(a?.tree_level_3 || '') ||
      !!normalizeImportText(a?.tree_level_4 || '') ||
      !!normalizeImportText(a?.tree_level_5 || '') ||
      !!normalizeImportText(a?.tree_path || '')
    if (hasTreeData && normalizeImportKey(activity) === 'sinactividad') return '-'
    return activity || '-'
  }

  const getAreaDisplay = (a: any) => {
    const area = normalizeImportText(a?.area || '')
    if (normalizeImportKey(area) === 'sinarea') return 'S/A'
    return area || '-'
  }

  const mappingFieldsBase = [
    { key: 'tree_path', label: 'Árbol' },
    { key: 'item_id', label: 'ID' },
    { key: 'sub_id', label: 'Sub-ID' },
    { key: 'area', label: 'Área' },
    { key: 'activity', label: 'Actividad' },
    { key: 'package', label: 'Paquete' },
    { key: 'discipline', label: 'Disciplina' },
    { key: 'description', label: 'Descripción' },
    { key: 'unit', label: 'Unidad' },
    { key: 'quantity', label: 'Cantidad' },
    { key: 'observations', label: 'Observaciones' },
  ] as const

  const mappingFieldsTree = [
    { key: 'tree_level_1', label: 'Árbol 1' },
    { key: 'tree_level_2', label: 'Árbol 2' },
    { key: 'tree_level_3', label: 'Árbol 3' },
    { key: 'tree_level_4', label: 'Árbol 4' },
    { key: 'tree_level_5', label: 'Árbol 5' },
  ] as const
  const mappingFields = showTreeMappingColumns
    ? [
        ...mappingFieldsTree,
        ...mappingFieldsBase,
      ]
    : mappingFieldsBase

  return (
    <Box sx={{ display: 'flex', overflowX: 'hidden', width: '100%' }}>
      <Box sx={{ flex: 1, overflowX: 'hidden', minWidth: 0 }}>
        <UserHeader title="Programa" />
        <Box component="main" sx={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', minWidth: 0 }}>
          <Container
            maxWidth={false}
            disableGutters
            sx={{ py: 3, width: '100%', maxWidth: '100% !important', px: { xs: 2, sm: 3, md: 4 }, overflowX: 'hidden', minWidth: 0 }}
          >
            <Paper
              sx={{
                p: 2,
                overflowX: 'hidden',
                overflowY: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: 'calc(100vh - 132px)',
                minHeight: 420,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: 'minmax(280px, 1fr) auto' },
                  alignItems: 'start',
                  mb: 2,
                  gap: 1.2,
                  overflowX: 'hidden',
                  width: '100%',
                  minWidth: 0,
                  flexShrink: 0,
                  maxWidth: '100%',
                }}
              >
                <TextField
                  size="small"
                  placeholder="Buscar en programa: ID, actividad, área, disciplina..."
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  sx={{ bgcolor: '#fff', width: '100%', minWidth: 0, maxWidth: { xs: '100%', lg: 560 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                    width: '100%',
                    justifyContent: { xs: 'flex-start', lg: 'flex-end' },
                    minWidth: 0,
                    overflowX: 'hidden',
                    '& .MuiButton-root': {
                      maxWidth: '100%',
                      flexShrink: 1,
                    },
                  }}
                >
                  <Button
                    variant={programView === 'tree' ? 'contained' : 'outlined'}
                    onClick={() => setProgramView('tree')}
                  >
                    Vista árbol
                  </Button>
                  <Button
                    variant={programView === 'table' ? 'contained' : 'outlined'}
                    onClick={() => setProgramView('table')}
                  >
                    Vista tabla
                  </Button>
                  {programView === 'table' && (
                    <Button
                      variant={showTreeBreakdown ? 'contained' : 'outlined'}
                      onClick={() => setShowTreeBreakdown((s) => !s)}
                    >
                      {showTreeBreakdown ? 'Ocultar detalle árbol' : 'Mostrar detalle árbol'}
                    </Button>
                  )}
                  <Button sx={{ mr: 1 }} variant="outlined" onClick={() => { setShowForm(!showForm); if (showForm) resetForm() }}>{showForm ? 'Cancelar' : 'Nuevo'}</Button>
                  <Button variant="contained" onClick={() => fileInputRef.current?.click()}>Importar CSV / Excel</Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=",.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xlsx"
                    onChange={handleFile}
                    style={{ display: 'none' }}
                  />
                </Box>
              </Box>

              {showForm && (
                <Paper sx={{ mb: 2, p: 2, borderRadius: 1, border: '1px solid #eee', overflowX: 'hidden', minWidth: 0, flexShrink: 0 }} elevation={0}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>{editingId ? 'Editar actividad' : 'Crear actividad'}</Typography>
                  <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, mt: 1 }}>
                    <input placeholder="ID" value={fItemId} onChange={(e) => setFItemId(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Sub-ID" value={fSubId} onChange={(e) => setFSubId(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Área" value={fArea} onChange={(e) => setFArea(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Disciplina" value={fDiscipline} onChange={(e) => setFDiscipline(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Actividad" value={fActivity} onChange={(e) => setFActivity(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Paquete" value={fPackage} onChange={(e) => setFPackage(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Cantidad" value={String(fQuantity)} onChange={(e) => setFQuantity(e.target.value === '' ? '' : Number(e.target.value))} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Unidad" value={fUnit} onChange={(e) => setFUnit(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <input placeholder="Observaciones" value={fObservations} onChange={(e) => setFObservations(e.target.value)} style={{ gridColumn: '1 / -1', padding: 8, borderRadius: 6, border: '1px solid #d0d7de' }} />
                    <textarea placeholder="Descripción" value={fDescription} onChange={(e) => setFDescription(e.target.value)} style={{ gridColumn: '1 / -1', minHeight: 100, padding: 10, borderRadius: 6, border: '1px solid #d0d7de' }} />
                  </Box>
                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="contained" onClick={handleSaveActivity} size="medium" sx={{ minWidth: 120, borderRadius: 2 }}>{editingId ? 'Actualizar' : 'Crear'}</Button>
                  </Box>
                </Paper>
              )}
              <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', width: '100%', maxWidth: '100%' }}>
              {programView === 'table' ? (
                <Box sx={{ overflowX: 'auto', overflowY: 'auto', width: '100%', maxWidth: '100%', minWidth: 0, height: '100%' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1200 }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, zIndex: 4 }}>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Árbol</th>
                        {showTreeBreakdown && <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Árbol 1</th>}
                        {showTreeBreakdown && <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Árbol 2</th>}
                        {showTreeBreakdown && <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Árbol 3</th>}
                        {showTreeBreakdown && <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Árbol 4</th>}
                        {showTreeBreakdown && <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Árbol 5</th>}
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>ID</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Sub-ID</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Área</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Disciplina</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Actividad</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Paquete</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Cantidad</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Unidad</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Observaciones</th>
                        <th style={{ borderTop: '1px solid #dbe6f7', borderBottom: '1px solid #dbe6f7', borderLeft: '1px solid #dbe6f7', borderRight: '1px solid #dbe6f7', padding: 10, textAlign: 'center', background: '#f3f7ff', color: '#123d73', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivities.map((a, idx) => (
                        <tr key={a.id}>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff', maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={getTreeSummary(a)}>
                                {getTreeSummary(a)}
                              </Box>
                              <Tooltip title="Mover a nivel anterior">
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => moveTreeLevel(a, -1)}
                                    disabled={movingTreeId === String(a.id)}
                                  >
                                    <KeyboardArrowLeftRoundedIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Mover a nivel siguiente">
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => moveTreeLevel(a, 1)}
                                    disabled={movingTreeId === String(a.id)}
                                  >
                                    <KeyboardArrowRightRoundedIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Box>
                          </td>
                          {showTreeBreakdown && <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.tree_level_1 || '-'}</td>}
                          {showTreeBreakdown && <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.tree_level_2 || '-'}</td>}
                          {showTreeBreakdown && <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.tree_level_3 || '-'}</td>}
                          {showTreeBreakdown && <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.tree_level_4 || '-'}</td>}
                          {showTreeBreakdown && <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.tree_level_5 || '-'}</td>}
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.item_id || '-'}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.sub_id || '-'}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getAreaDisplay(a)}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.discipline || '-'}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>{getActivityDisplay(a)}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.package || '-'}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.quantity ?? '-'}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.unit || '-'}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', padding: 8, textAlign: 'center', background: idx % 2 === 0 ? '#fff' : '#fbfdff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{a.observations || '-'}</td>
                          <td style={{ borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', borderRight: '1px solid #edf2f7', padding: 8, background: idx % 2 === 0 ? '#fff' : '#fbfdff' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                              <Tooltip title="Ver">
                                <IconButton size="small" aria-label="Ver actividad" onClick={() => router.push(`/users/program?id=${a.id}`)}>
                                  <VisibilityOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Editar">
                                <IconButton size="small" aria-label="Editar actividad" onClick={() => handleEdit(a)}>
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Eliminar">
                                <IconButton size="small" color="error" aria-label="Eliminar actividad" onClick={() => handleDelete(a.id)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </td>
                        </tr>
                      ))}
                      {filteredActivities.length === 0 && (
                        <tr>
                          <td colSpan={showTreeBreakdown ? 16 : 11} style={{ textAlign: 'center', padding: 18, color: '#64748b', borderBottom: '1px solid #edf2f7', borderLeft: '1px solid #edf2f7', borderRight: '1px solid #edf2f7' }}>
                            Sin coincidencias para la búsqueda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Box>
              ) : (
                <Box sx={{ overflowX: 'auto', overflowY: 'hidden', width: '100%', maxWidth: '100%', minWidth: 0, height: '100%' }}>
                  <Box sx={{ border: '1px solid #dbe6f7', borderRadius: 1, minWidth: 1200, height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 140px 1.4fr 110px 90px', background: '#f3f7ff', borderBottom: '1px solid #dbe6f7', position: 'sticky', top: 0, zIndex: 3 }}>
                    <Box sx={{ p: 1.2, fontWeight: 700, color: '#123d73', whiteSpace: 'nowrap' }}>Estructura</Box>
                    <Box sx={{ p: 1.2, fontWeight: 700, color: '#123d73', textAlign: 'center', whiteSpace: 'nowrap' }}>ID</Box>
                    <Box sx={{ p: 1.2, fontWeight: 700, color: '#123d73', whiteSpace: 'nowrap' }}>Actividad</Box>
                    <Box sx={{ p: 1.2, fontWeight: 700, color: '#123d73', textAlign: 'center', whiteSpace: 'nowrap' }}>Cantidad</Box>
                    <Box sx={{ p: 1.2, fontWeight: 700, color: '#123d73', textAlign: 'center', whiteSpace: 'nowrap' }}>Unidad</Box>
                  </Box>
                  <Box>
                    {treeRows.length === 0 ? (
                      <Box sx={{ p: 2, color: '#64748b', textAlign: 'center' }}>Sin coincidencias para la búsqueda.</Box>
                    ) : (
                      treeRows.map((row, idx) => {
                        const bg = idx % 2 === 0 ? '#fff' : '#fbfdff'
                        if (row.kind === 'node') {
                          return (
                            <Box
                              key={row.key}
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 140px 1.4fr 110px 90px',
                                background: '#eef4ff',
                                borderBottom: '1px solid #e4edf9',
                              }}
                            >
                              <Box sx={{ p: 1.1, pl: `${12 + row.depth * 18}px`, fontWeight: 700, color: '#123d73', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {row.label}
                              </Box>
                              <Box />
                              <Box />
                              <Box />
                              <Box />
                            </Box>
                          )
                        }
                        const a = row.activity
                        return (
                          <Box
                            key={row.key}
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 140px 1.4fr 110px 90px',
                              background: bg,
                              borderBottom: '1px solid #edf2f7',
                            }}
                          >
                            <Box sx={{ p: 1.1, pl: `${12 + row.depth * 18}px`, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {normalizeImportText(a?.discipline || a?.package || a?.area || '-')}
                            </Box>
                            <Box sx={{ p: 1.1, textAlign: 'center', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a?.item_id || '-'}</Box>
                            <Box sx={{ p: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getActivityDisplay(a)}</Box>
                            <Box sx={{ p: 1.1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a?.quantity ?? '-'}</Box>
                            <Box sx={{ p: 1.1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a?.unit || '-'}</Box>
                          </Box>
                        )
                      })
                    )}
                  </Box>
                </Box>
                </Box>
              )}
              </Box>

              <Dialog open={mappingModalOpen} onClose={() => setMappingModalOpen(false)} fullWidth maxWidth="xl">
                <DialogTitle>Mapear columnas del archivo</DialogTitle>
                <DialogContent>
                  <Typography variant="body2" sx={{ mb: 2 }}>Comprueba y ajusta el mapeo entre los campos de la tabla y las cabeceras del archivo.</Typography>
                  <Box sx={{ mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'nowrap' }}>
                    {importSheetNames.length > 1 && (
                      <FormControl sx={{ minWidth: 260, flex: 1 }}>
                        <InputLabel id="sheet-select-label">Hoja</InputLabel>
                        <Select
                          labelId="sheet-select-label"
                          size="small"
                          label="Hoja"
                          value={selectedImportSheet}
                          onChange={(e) => {
                            const nextSheet = String(e.target.value || '')
                            setSelectedImportSheet(nextSheet)
                            const nextAoa = parsedSheetsByName[nextSheet] || []
                            setParsedAoa(nextAoa)
                            setHeaderRowNumber(1)
                            applyHeaderSelection(nextAoa, 1)
                          }}
                        >
                          {importSheetNames.map((sheetName) => (
                            <MenuItem key={sheetName} value={sheetName}>
                              {sheetName}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                    <FormControl sx={{ minWidth: 260, flex: 1 }}>
                      <InputLabel id="header-row-label">Fila de cabecera</InputLabel>
                      <Select
                        labelId="header-row-label"
                        size="small"
                        label="Fila de cabecera"
                        value={String(headerRowNumber)}
                        onChange={(e) => {
                          const next = Number(e.target.value || 1)
                          setHeaderRowNumber(next)
                          if (parsedAoa && parsedAoa.length > 0) {
                            applyHeaderSelection(parsedAoa, next)
                          }
                        }}
                      >
                        {(parsedAoa || []).slice(0, 40).map((row, idx) => (
                          <MenuItem key={`hdr-${idx + 1}`} value={String(idx + 1)}>
                            {`Fila ${idx + 1}: ${String((row || []).slice(0, 3).map((c: any) => normalizeImportText(c)).filter(Boolean).join(' | ') || '(vacía)')}`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Vista previa de importación</Typography>
                      <Button size="small" variant={showTreeMappingColumns ? 'contained' : 'outlined'} onClick={() => setShowTreeMappingColumns((s) => !s)}>
                        {showTreeMappingColumns ? 'Ocultar columnas árbol' : 'Mostrar columnas árbol'}
                      </Button>
                    </Box>
                    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, mb: 1.5 }}>
                      {mappingFields.map((f) => (
                        <FormControl key={`map-${f.key}`} size="small">
                          <InputLabel id={`map-field-${f.key}`}>{f.label}</InputLabel>
                          <Select
                            labelId={`map-field-${f.key}`}
                            label={f.label}
                            value={fieldMapping[f.key] || ''}
                            onChange={(e) => setFieldMapping(prev => ({ ...prev, [f.key]: String(e.target.value || '') }))}
                          >
                            <MenuItem value="">(no asignar)</MenuItem>
                            {availableHeaders.map((h) => (
                              <MenuItem key={`${f.key}-${h}`} value={h}>{h}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ))}
                    </Box>
                    {mappedPreview.length === 0 ? (
                      <Typography variant="body2" sx={{ color: '#777' }}>
                        Sin filas detectadas para vista previa.
                      </Typography>
                    ) : (
                      <Box sx={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 1 }}>
                        <table style={{ width: '100%', minWidth: 1400, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              {mappingFields.map((f) => (
                                <th
                                  key={`preview-h-${f.key}`}
                                  style={{
                                    textAlign: 'left',
                                    padding: 8,
                                    borderBottom: '1px solid #e5e7eb',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {f.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {mappedPreview.map((row, idx) => (
                              <tr key={`${row.item_id || 'noid'}-${idx}`} style={{ background: idx % 2 === 0 ? '#fff' : '#fbfdff' }}>
                                {mappingFields.map((f) => {
                                  const val = (row as any)?.[f.key]
                                  return (
                                    <td
                                      key={`preview-c-${idx}-${f.key}`}
                                      style={{
                                        padding: 8,
                                        borderBottom: '1px solid #eef2f7',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: 260
                                      }}
                                      title={val == null || String(val).trim() === '' ? '-' : String(val)}
                                    >
                                      {val == null || String(val).trim() === '' ? '-' : String(val)}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Box>
                    )}
                  </Box>
                </DialogContent>
                <DialogActions>
                  <Button disabled={isImporting} onClick={() => {
                    setMappingModalOpen(false)
                    setImportSheetNames([])
                    setSelectedImportSheet('')
                    setParsedSheetsByName({})
                    setParsedRows(null)
                    setParsedAoa(null)
                  }}>Cancelar</Button>
                  <Button variant="contained" onClick={applyMappingAndImport} disabled={isImporting}>
                    {isImporting ? 'Importando...' : 'Importar'}
                  </Button>
                </DialogActions>
                {isImporting && (
                  <Box sx={{ px: 3, pb: 2 }}>
                    <Typography variant="caption" sx={{ color: '#475569' }}>
                      {importProgressLabel || 'Importando...'}
                    </Typography>
                    <LinearProgress variant="determinate" value={importProgress} sx={{ mt: 0.6, height: 8, borderRadius: 99 }} />
                  </Box>
                )}
              </Dialog>

            </Paper>
          </Container>
        </Box>
      </Box>
    </Box>
  )
}
