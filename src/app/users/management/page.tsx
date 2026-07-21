"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useSession } from 'next-auth/react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMediaQuery, useTheme } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { es } from 'date-fns/locale';
import {
  AssignmentTurnedIn,
  AssignmentLateOutlined,
  CalendarMonth,
  ChevronLeft,
  ChevronRight,
  EditOutlined,
  FileUpload,
  Download,
  ExpandMore,
  PushPin,
  PushPinOutlined,
  Search,
  Clear,
  QueryStatsOutlined,
  HistoryOutlined,
  GroupsOutlined,
  WarningAmberOutlined,
  ConstructionOutlined,
  AccountTreeOutlined,
  SendOutlined,
  PhotoLibraryOutlined,
} from '@mui/icons-material';
import { Trash2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import UserHeader from '@/components/layout/UserHeader';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { AppAlert } from '@/components/ui/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppFormStack, AppSearchField, AppSelectControl, AppTextField } from '@/components/ui/FormControls';
import { AppCheckbox, AppIconButton } from '@/components/ui/InteractiveControls';
import { AppTabs } from '@/components/ui/AppTabs';
import { useAppSnackbar } from '@/components/ui/AppSnackbarProvider';
import { MultiFileDropzone } from '@/components/ui/FileDropzone';
import { AppWeekNavigator } from '@/components/ui/AppWeekNavigator';
import { AppFloatingActionButton } from '@/components/ui/AppFloatingActionButton';
import { colors } from '@/theme/theme';
import { normalizeUppercaseDisplayText } from '@/lib/normalize';
import {
  isManagementTab,
  type ManagementTab,
  resolveAllowedManagementTabs,
} from '@/lib/managementPermissions';
import TransmittalPanel from './TransmittalPanel';

type FieldReportRecord = Record<string, any>;

const MANAGEMENT_FETCH_CACHE_TTL_MS = 30_000;
const fieldReportsPromiseCache = new Map<string, { promise: Promise<FieldReportRecord[]>; expiresAt: number }>();
let collaboratorSummaryPromiseCache: { promise: Promise<any[]>; expiresAt: number } | null = null;
const hhSummaryPromiseCache = new Map<string, { promise: Promise<any>; expiresAt: number }>();
let hhHistoryPromiseCache: { promise: Promise<any[]>; expiresAt: number } | null = null;
const photoReportConfigPromiseCache = new Map<string, { promise: Promise<any>; expiresAt: number }>();
let fieldReportDatesPromiseCache: { promise: Promise<string[]>; expiresAt: number } | null = null;

const EquipmentSearchInput = React.memo(function EquipmentSearchInput({
  onSearch,
}: {
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
  }, []);

  const updateSearch = (nextValue: string) => {
    setValue(nextValue);
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onSearch(nextValue);
      debounceRef.current = null;
    }, 180);
  };

  const clearSearch = () => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = null;
    setValue('');
    onSearch('');
  };

  return (
    <AppTextField
      size="small"
      variant="outlined"
      placeholder="Buscar nombre, patente, serie o fecha"
      value={value}
      onChange={(event) => updateSearch(event.target.value)}
      inputProps={{ 'aria-label': 'Buscar equipos por nombre, patente, serie o fecha' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search sx={{ color: colors.slate500, fontSize: 22 }} />
          </InputAdornment>
        ),
        endAdornment: value ? (
          <InputAdornment position="end">
            <AppIconButton
              size="small"
              aria-label="Limpiar búsqueda de equipos"
              title="Limpiar"
              onClick={clearSearch}
              sx={{ color: colors.slate400, p: 0.35 }}
            >
              <Clear sx={{ fontSize: 21 }} />
            </AppIconButton>
          </InputAdornment>
        ) : undefined,
      }}
      sx={{
        width: { xs: 'calc(100% - 82px)', sm: '100%' },
        gridColumn: { xs: '1 / -1', sm: 'auto' },
        position: 'relative',
        right: { xs: 36, sm: 72 },
        '& .MuiOutlinedInput-root': {
          height: 40,
          bgcolor: colors.white,
          borderRadius: 1,
          '& fieldset': { borderColor: colors.slate300 },
          '&:hover fieldset': { borderColor: colors.slate400 },
          '&.Mui-focused fieldset': { borderColor: colors.blue600, borderWidth: 1 },
        },
        '& .MuiInputBase-input': {
          fontSize: 14,
          py: 0,
        },
      }}
    />
  );
});

const fetchManagementFieldReports = (queryString: string): Promise<FieldReportRecord[]> => {
  const now = Date.now();
  const cached = fieldReportsPromiseCache.get(queryString);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetch(`/api/field-reports?${queryString}`)
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      return Array.isArray(payload) ? payload : [];
    })
    .catch((err) => {
      fieldReportsPromiseCache.delete(queryString);
      throw err;
    });

  fieldReportsPromiseCache.set(queryString, {
    promise,
    expiresAt: now + MANAGEMENT_FETCH_CACHE_TTL_MS,
  });

  return promise;
};

const fetchCollaboratorSummary = (): Promise<any[]> => {
  const now = Date.now();
  if (collaboratorSummaryPromiseCache && collaboratorSummaryPromiseCache.expiresAt > now) {
    return collaboratorSummaryPromiseCache.promise;
  }

  const promise = fetch('/api/collaborators?summary=1')
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      return Array.isArray(payload) ? payload : [];
    })
    .catch((err) => {
      collaboratorSummaryPromiseCache = null;
      throw err;
    });

  collaboratorSummaryPromiseCache = {
    promise,
    expiresAt: now + MANAGEMENT_FETCH_CACHE_TTL_MS,
  };

  return promise;
};

const fetchFieldReportDateKeys = (): Promise<string[]> => {
  const now = Date.now();
  if (fieldReportDatesPromiseCache && fieldReportDatesPromiseCache.expiresAt > now) {
    return fieldReportDatesPromiseCache.promise;
  }

  const promise = fetch('/api/field-reports?dates=1')
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      return Array.isArray(payload?.dates) ? payload.dates : [];
    })
    .catch((err) => {
      fieldReportDatesPromiseCache = null;
      throw err;
    });

  fieldReportDatesPromiseCache = {
    promise,
    expiresAt: now + MANAGEMENT_FETCH_CACHE_TTL_MS,
  };

  return promise;
};

const fetchManagementHhSummary = (queryString: string): Promise<any> => {
  const now = Date.now();
  const cached = hhSummaryPromiseCache.get(queryString);
  if (cached && cached.expiresAt > now) return cached.promise;

  const url = queryString ? `/api/management/hh-summary?${queryString}` : '/api/management/hh-summary';
  const promise = fetch(url)
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      return payload || {};
    })
    .catch((err) => {
      hhSummaryPromiseCache.delete(queryString);
      throw err;
    });

  hhSummaryPromiseCache.set(queryString, {
    promise,
    expiresAt: now + MANAGEMENT_FETCH_CACHE_TTL_MS,
  });

  return promise;
};

const fetchManagementHhHistory = (): Promise<any[]> => {
  const now = Date.now();
  if (hhHistoryPromiseCache && hhHistoryPromiseCache.expiresAt > now) {
    return hhHistoryPromiseCache.promise;
  }

  const promise = fetch('/api/management/hh-history')
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      return Array.isArray(payload) ? payload : [];
    })
    .catch((err) => {
      hhHistoryPromiseCache = null;
      throw err;
    });

  hhHistoryPromiseCache = {
    promise,
    expiresAt: now + MANAGEMENT_FETCH_CACHE_TTL_MS,
  };

  return promise;
};

const fetchPhotoReportConfig = (queryString = ''): Promise<any> => {
  const now = Date.now();
  const cached = photoReportConfigPromiseCache.get(queryString);
  if (cached && cached.expiresAt > now) return cached.promise;

  const url = queryString ? `/api/management/photo-report-config?${queryString}` : '/api/management/photo-report-config';
  const promise = fetch(url)
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      return payload || {};
    })
    .catch((err) => {
      photoReportConfigPromiseCache.delete(queryString);
      throw err;
    });

  photoReportConfigPromiseCache.set(queryString, {
    promise,
    expiresAt: now + MANAGEMENT_FETCH_CACHE_TTL_MS,
  });

  return promise;
};

const clearPhotoReportConfigCache = () => {
  photoReportConfigPromiseCache.clear();
};

declare global {
  interface Window {
    PptxGenJS?: any;
  }
}

type InterferenceImageMeta = {
  name: string;
  size: number;
  type: string;
  key?: string;
};

type InterferenceFormState = {
  workFront: string;
  timeType: string;
  timeDetail: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
};

type ManagementInterferenceRecord = {
  id: string;
  work_front?: string | null;
  time_type?: string | null;
  time_detail?: string | null;
  interference_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
  images?: InterferenceImageMeta[] | null;
  created_by_email?: string | null;
  created_at?: string | null;
};

type HistoricalHhRecord = {
  id: string;
  work_front?: string | null;
  report_no?: number | null;
  report_date?: string | null;
  week_no?: number | null;
  indirect_hh?: number | string | null;
  direct_hh?: number | string | null;
  daily_hh?: number | string | null;
  indirect_hh_accum?: number | string | null;
  direct_hh_accum?: number | string | null;
  total_hh_accum?: number | string | null;
  major_hm_daily?: number | string | null;
  major_hm_accum?: number | string | null;
  minor_hm_daily?: number | string | null;
  minor_hm_accum?: number | string | null;
  source?: string | null;
  notes?: string | null;
};

type HistoricalHhFrontGroup = {
  front: string;
  rows: HistoricalHhRecord[];
  weekly: Array<{ weekNo: number; indirectHh: number; directHh: number; hm: number }>;
};

type DirectHhSummaryRow = {
  date: string;
  specialty: string;
  reports: number;
  peopleRows: number;
  hh: number;
  hhExtras: number;
};

type GroupSummary = {
  label: string;
  hh: number;
  hhExtras: number;
  dailyReportDirectHh?: number;
  peopleRows: number;
  reports: number;
};

type DayDashboardRow = {
  date: string;
  hh: number;
  hhExtras: number;
  dailyReportDirectHh?: number;
  dailyReportIndirectHh?: number;
  dailyReportHh?: number;
  dailyReportCount?: number;
  peopleRows: number;
  reports: number;
  indirectTurnoTotal: number;
  indirectTurnoHhTotal?: number;
  bySpecialty: GroupSummary[];
  byFront: GroupSummary[];
  byFrontSpecialty: Array<{ front: string; specialties: GroupSummary[] }>;
  byPosition: GroupSummary[];
  indirectTurnoByPosition: GroupSummary[];
  specialtyAudit: Array<{
    specialty: string;
    declaredRows: number;
    uniquePeople: number;
    people: Array<{ personKey: string; name: string; document: string; reports: number }>;
  }>;
};

type HhMatrixRow = {
  key: string;
  specialty: string;
  position: string;
  front: string;
  peopleRows: number;
  reports: number;
  hh: number;
  hhExtras: number;
  dailyReportHh: number;
  byDate: Record<string, number>;
  byWeek: Record<string, number>;
};

type HhMatrixSort = {
  key: string;
  direction: 'asc' | 'desc';
};

const HH_MATRIX_NON_BASE_ALL_TIME = '__NON_BASE_ALL_TIME__';

const isHhMatrixBaseFront = (value: unknown) => {
  const front = normalizeLabel(value);
  return (
    front === 'CANALETAS' ||
    front === 'PISCINAS' ||
    front.includes('CONTRATO BASE CANALETAS') ||
    front.includes('CONTRATO BASE PISCINAS')
  );
};

type HhSummaryPayload = {
  date_from?: string;
  date_to?: string;
  weeks?: Array<{ key: string; label: string; start: string; end: string }>;
  dates?: string[];
  direct_hh_by_day_specialty?: DirectHhSummaryRow[];
  dashboard_by_day?: DayDashboardRow[];
  matrix_rows?: HhMatrixRow[];
  matrix_totals_by_week?: Record<string, number>;
  daily_report_weekly_summary?: {
    direct_hh: number;
    indirect_hh: number;
    total_hh: number;
    report_count: number;
    by_front: Array<{
      front: string;
      direct_hh: number;
      indirect_hh: number;
      total_hh: number;
      reports: number;
    }>;
  };
  total_hh_directas?: number;
  total_hh_extras_directas?: number;
  directos_declarados?: number;
  report_count?: number;
};

type ManagementActivityRow = {
  reportId: string;
  reportNo: number | null;
  date: string;
  front: string;
  area: string;
  crew: string;
  specialty: string;
  name: string;
  quantity: number;
  unit: string;
  startTime: string;
  endTime: string;
  sourceIndex: number;
};

type ManagementCrewPersonnelRow = {
  key: string;
  reportId: string;
  reportNo: number | null;
  date: string;
  front: string;
  name: string;
  position: string;
  workerType: string;
  rut: string;
  hh: number;
  hhExtras: number;
  sourceIndex: number;
};

type PhotoEvidenceItem = {
  key: string;
  name: string;
  front: string;
  date: string;
  reportNo: string;
  reportId: string;
  reportTitle: string;
  crew: string;
  searchText?: string;
  activitySummary?: string;
};

type PhotoActivitySuggestion = {
  key: string;
  front: string;
  label: string;
  imageCount: number;
  reportCount: number;
  crewCount: number;
  selectedCount: number;
};

type PhotoSlideItem = {
  evidence: PhotoEvidenceItem;
  ratio: number;
  isNarrow: boolean;
  isVeryWide: boolean;
};

type PhotoSlideGroup = {
  key: string;
  layout: 'one' | 'two' | 'three';
  crew: string;
  defaultTitle: string;
  items: PhotoSlideItem[];
};

type SavedPhotoReportConfig = {
  id: string;
  report_no: string;
  period_start: string;
  period_end: string;
  updated_at?: string | null;
  updated_by_email?: string | null;
};

type EquipmentKind = 'MAYOR' | 'MENOR';
type ManagementEquipmentRow = {
  id?: string;
  report_date: string;
  equipment_kind: EquipmentKind;
  equipment_name: string;
  patent?: string | null;
  quantity?: number | null;
  canaletas_qty?: number | null;
  piscinas_qty?: number | null;
  is_operational: boolean;
  in_maintenance: boolean;
  in_accreditation: boolean;
  in_breakdown: boolean;
  include_in_daily_report?: boolean;
  entry_date?: string | null;
  return_date?: string | null;
  lifecycle_periods?: Array<{ entry_date: string; exit_date?: string | null }>;
  mileage_km?: number | null;
  notes?: string | null;
};

type ReportFrontRow = {
  id?: string | null;
  code: string;
  name: string;
  title_prefix: string;
  type: string;
  sequence_mode: string;
  next_sequence_no?: number | null;
  date_anchor?: string | null;
  date_anchor_sequence_no?: number | null;
  is_active: boolean;
  include_in_daily_activities?: boolean;
  sort_order?: number | null;
};

type ReportFrontDraft = {
  id?: string | null;
  code: string;
  name: string;
  title_prefix: string;
  type: 'base' | 'ifa' | 'udr' | 'other';
  sequence_mode: 'incremental' | 'date_anchor';
  next_sequence_no: string;
  date_anchor: string;
  date_anchor_sequence_no: string;
  is_active: boolean;
  include_in_daily_activities: boolean;
  sort_order: string;
};

const parseJsonMaybe = (value: any) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeLabel = (value: any) => normalizeUppercaseDisplayText(String(value || '').trim().toUpperCase());
const normalizePhotoSlideTitle = (value: any) => normalizeUppercaseDisplayText(String(value || '').trim().toUpperCase());
const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const PHOTO_REPORT_BADGE_COLORS = [
  { background: colors.blue100, border: colors.blue300, text: colors.blue900 },
  { background: colors.sky100, border: colors.sky300, text: colors.blue3 },
  { background: colors.green100, border: colors.green600, text: colors.green800 },
  { background: colors.amber100, border: colors.amber700, text: colors.amber800 },
  { background: colors.rose100, border: colors.red300, text: colors.red800 },
  { background: colors.slate200, border: colors.slate400, text: colors.slate800 },
] as const;
const PHOTO_MODULE_OTHER = 'OTROS';
const getPhotoReportIdentity = (item: PhotoEvidenceItem) =>
  String(item.reportId || item.reportNo || item.reportTitle || 'sin-reporte').trim();
const getPhotoReportShortLabel = (item: PhotoEvidenceItem) => {
  if (item.reportNo) return `N°${item.reportNo}`;
  const reportId = String(item.reportId || '').trim();
  return reportId ? String(reportId.split('-')[0] || reportId) : '-';
};
const getPhotoReportBadgeColors = (item: PhotoEvidenceItem) => {
  const identity = getPhotoReportIdentity(item);
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) - hash + identity.charCodeAt(index)) | 0;
  }
  return PHOTO_REPORT_BADGE_COLORS[Math.abs(hash) % PHOTO_REPORT_BADGE_COLORS.length];
};
const getManagementNocFrontGroupKey = (value: any) => {
  const normalized = normalizeLabel(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const numbers = Array.from(normalized.matchAll(/NOC(?:[^0-9A-Z]*N)?[^0-9A-Z]*([0-9O]{1,5})/g))
    .map((match) => String(match?.[1] || '').replace(/O/g, '0').replace(/\D/g, ''))
    .map((num) => Number(num))
    .filter((num) => Number.isFinite(num) && num > 0)
    .map((num) => String(num).padStart(3, '0'));
  const uniqueNumbers = Array.from(new Set(numbers));
  return uniqueNumbers.length > 0 ? `NOC:${uniqueNumbers.join('+')}` : (normalizeLabel(value) || 'SIN FRENTE');
};
const pickPreferredManagementFrontLabel = (current: any, next: any) => {
  const currentLabel = normalizeLabel(current);
  const nextLabel = normalizeLabel(next);
  if (!currentLabel || currentLabel.startsWith('NOC:')) return nextLabel || currentLabel || 'SIN FRENTE';
  if (!nextLabel) return currentLabel;
  const currentIsAbbrev = /\bUDR\b/.test(currentLabel);
  const nextIsExpanded = nextLabel.includes('USO DE RECURSOS');
  if (currentIsAbbrev && nextIsExpanded) return nextLabel;
  const currentIsExpanded = currentLabel.includes('USO DE RECURSOS');
  const nextIsAbbrev = /\bUDR\b/.test(nextLabel);
  if (currentIsExpanded && nextIsAbbrev) return currentLabel;
  return nextLabel.length > currentLabel.length ? nextLabel : currentLabel;
};
const formatManagementFrontChartLabel = (value: any) => {
  const label = normalizeLabel(value) || 'SIN FRENTE';
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const numbers = Array.from(normalized.matchAll(/NOC(?:[^0-9A-Z]*N)?[^0-9A-Z]*([0-9O]{1,5})/g))
    .map((match) => String(match?.[1] || '').replace(/O/g, '0').replace(/\D/g, ''))
    .map((num) => Number(num))
    .filter((num) => Number.isFinite(num) && num > 0)
    .map((num) => String(num).padStart(3, '0'));
  const uniqueNumbers = Array.from(new Set(numbers));
  if (uniqueNumbers.length > 0) {
    const prefix = `NOC ${uniqueNumbers.join('/')}`;
    if (normalized.includes('TRABAJOS ELECTRICOS')) return `${prefix} ELECTRICOS`;
    if (normalized.includes('CALAMINAS')) return `${prefix} CALAMINAS`;
    if (normalized.includes('LINEA 450')) return `${prefix} LINEA 450 HDPE`;
    if (normalized.includes('PISCINA AGUA SALADA')) return `${prefix} PISCINA AGUA`;
    if (normalized.includes('VERTEDERO')) return `${prefix} VERTEDERO`;
    return prefix;
  }
  if (label.startsWith('CONTRATO BASE ')) return label.replace('CONTRATO BASE ', 'BASE ');
  return label.length > 24 ? `${label.slice(0, 22)}...` : label;
};
const parseDateKeyToLocalDate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};
const dateToKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const addDaysToDateKey = (value: string, days: number) => {
  const date = parseDateKeyToLocalDate(value);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return dateToKey(date);
};
const getWeekRangeFromDateKey = (value: string) => {
  const date = parseDateKeyToLocalDate(value);
  if (!date) return { start: '', end: '' };
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  const start = dateToKey(date);
  const end = addDaysToDateKey(start, 6);
  return { start, end };
};
const PROJECT_WEEK_ANCHOR_START = '2026-06-15';
const PROJECT_WEEK_ANCHOR_NUMBER = 11;
const getDateKeyDayNumber = (value: string) => {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.floor(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() / 86400000);
};
const getProjectWeekNumber = (value: string) => {
  const weekStart = getWeekRangeFromDateKey(value).start;
  const target = getDateKeyDayNumber(weekStart);
  const anchor = getDateKeyDayNumber(PROJECT_WEEK_ANCHOR_START);
  if (target == null || anchor == null) return PROJECT_WEEK_ANCHOR_NUMBER;
  return PROJECT_WEEK_ANCHOR_NUMBER + Math.floor((target - anchor) / 7);
};
const getLastCompletedWeekRange = () => {
  const today = dateToKey(new Date());
  const currentWeek = getWeekRangeFromDateKey(today);
  const start = addDaysToDateKey(currentWeek.start, -7);
  const end = addDaysToDateKey(currentWeek.end, -7);
  return {
    start: start || '2026-05-25',
    end: end || '2026-05-31',
  };
};
const buildWeekRangesFromDateKeys = (dates: string[]) => {
  const byStart = new Map<string, { start: string; end: string }>();
  dates.forEach((date) => {
    const cleanDate = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return;
    const range = getWeekRangeFromDateKey(cleanDate);
    if (range.start && !byStart.has(range.start)) byStart.set(range.start, range);
  });
  return Array.from(byStart.values()).sort((a, b) => b.start.localeCompare(a.start));
};
const listDateKeysBetween = (start: string, end: string) => {
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  let cursor = start;
  while (cursor && cursor <= end && out.length < 120) {
    out.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return out;
};
const HH_MATRIX_WEEK_ONE_START = '2026-04-06';
const PHOTO_REPORT_WEEK_ANCHOR_START = '2026-05-25';
const PHOTO_REPORT_WEEK_ANCHOR_NO = 8;
const getDateKeyDiffDays = (from: string, to: string) => {
  const fromDate = parseDateKeyToLocalDate(from);
  const toDate = parseDateKeyToLocalDate(to);
  if (!fromDate || !toDate) return 0;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
};
const getHhMatrixWeekNumberForDate = (date: string) => {
  const diffDays = getDateKeyDiffDays(HH_MATRIX_WEEK_ONE_START, date);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
};
const getHhMatrixWeekStartForDate = (date: string) => {
  const weekNo = getHhMatrixWeekNumberForDate(date);
  return addDaysToDateKey(HH_MATRIX_WEEK_ONE_START, (weekNo - 1) * 7);
};
const buildProjectWeeksBetween = (start: string, end: string) => {
  if (!start || !end || start > end) return [];
  const weeks: Array<{ key: string; label: string; start: string; end: string }> = [];
  let cursor = getHhMatrixWeekStartForDate(start) || start;
  while (cursor && cursor <= end && weeks.length < 30) {
    const weekStart = cursor;
    const candidateEnd = addDaysToDateKey(weekStart, 6);
    const weekEnd = candidateEnd && candidateEnd < end ? candidateEnd : end;
    const weekNo = getHhMatrixWeekNumberForDate(weekStart);
    weeks.push({
      key: `week-${weekNo}`,
      label: `Semana ${weekNo}`,
      start: weekStart,
      end: weekEnd,
    });
    cursor = addDaysToDateKey(weekEnd, 1);
  }
  return weeks;
};
const getSequentialWeekKeyForDate = (
  date: string,
  weeks: Array<{ key: string; start: string; end: string }>
) => {
  return weeks.find((week) => date >= week.start && date <= week.end)?.key || '';
};
const getPhotoReportWeekNumberForDate = (date: string) => {
  if (!parseDateKeyToLocalDate(date)) return null;
  const diffDays = getDateKeyDiffDays(PHOTO_REPORT_WEEK_ANCHOR_START, date);
  const weekNo = PHOTO_REPORT_WEEK_ANCHOR_NO + Math.floor(diffDays / 7);
  return Number.isFinite(weekNo) && weekNo > 0 ? weekNo : null;
};
const formatPhotoReportNumberForPeriod = (start: string, end: string) => {
  const weekNo = getPhotoReportWeekNumberForDate(start || end);
  return weekNo ? String(weekNo).padStart(3, '0') : '';
};
const toNumber = (value: any) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let normalized = raw.replace(/\s+/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) normalized = normalized.replace(/\./g, '').replace(',', '.');
    else normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: string) => {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return '-';
  const [year, month, day] = raw.split('-');
  return year && month && day ? `${day}/${month}/${year}` : raw;
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
};

const getHourFilterKey = (value: any) => {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isFinite(rounded) ? rounded.toFixed(1) : '0.0';
};

const formatChileanRut = (value: any) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw || raw === '-') return '-';
  const clean = raw.replace(/[^0-9K]/g, '');
  if (clean.length < 2 || clean.length > 9) return raw;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body) || !/^[0-9K]$/.test(dv)) return raw;
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};

const formatTime = (value: any) => {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 5) : '-';
};

const EquipmentStateBadge = ({ active, label, activeColor = colors.blue6 }: { active: boolean; label: string; activeColor?: string }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 88,
      px: 1,
      py: 0.35,
      borderRadius: 999,
      border: `1px solid ${active ? activeColor : colors.blue11}`,
      bgcolor: active ? colors.blue15 : colors.managementPanelBg,
      color: active ? activeColor : colors.blue7,
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.2,
    }}
  >
    {active ? label : '—'}
  </Box>
);

const formatSpanishLongDate = (value: string) => {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return '';
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const text = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatSpanishShortDate = (value: string) => {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return '';
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
};

const EquipmentLifecycleDate = ({
  value,
  periods,
}: {
  value?: string | null;
  periods?: Array<{ entry_date: string; exit_date?: string | null }>;
}) => {
  const label = formatSpanishShortDate(String(value || '').slice(0, 10)) || '-';
  if (!periods?.length) return <>{label}</>;

  return (
    <Tooltip
      arrow
      placement="top"
      title={
        <Box sx={{ py: 0.15 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.35 }}>
            Historial de ingresos y salidas
          </Typography>
          {periods.map((period, index) => (
            <Typography key={`${period.entry_date}-${index}`} sx={{ fontSize: 12, lineHeight: 1.55 }}>
              {`Ingreso: ${formatSpanishShortDate(period.entry_date)} | Salida: ${formatSpanishShortDate(String(period.exit_date || '')) || 'En obra'}`}
            </Typography>
          ))}
        </Box>
      }
    >
      <Box
        component="span"
        sx={{
          cursor: 'help',
          textDecoration: 'underline dotted',
          textUnderlineOffset: '3px',
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );
};

const parseDateFromIso = (value: string) => {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatIsoFromDate = (date: Date | null) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isSameDate = (a: Date | null, b: Date | null) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const parseEvidenceFilesLite = (value: any): Array<{ key: string; name: string; type?: string; size?: number }> => {
  const parsed = parseJsonMaybe(value);
  const list = Array.isArray(parsed) ? parsed : [];
  return list
    .map((item: any) => ({
      key: String(item?.key || '').trim(),
      name: String(item?.name || item?.file_name || 'Imagen').trim(),
      type: String(item?.type || '').trim() || undefined,
      size: Number(item?.size || 0) || undefined,
    }))
    .filter((item) => item.key.includes('/') && !/^image\//i.test(item.key));
};

const safeFileName = (value: string) => {
  return String(value || 'archivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
};

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const MANAGEMENT_WORK_FRONT_OPTIONS = [
  'CONTRATO BASE PISCINAS',
  'CONTRATO BASE CANALETAS',
  'USO DE RECURSOS NOC Nº001 CALAMINAS',
  'USO DE RECURSOS NOC Nº002 PISCINA AGUA SALADA',
  'USO DE RECURSOS NOC Nº006 TRABAJOS ELECTRICOS FASE 1',
  'USO DE RECURSOS NOC Nº007 VERTEDERO PISCINA ILS 2',
] as const;

const DEFAULT_REPORT_FRONT_DRAFT: ReportFrontDraft = {
  code: '',
  name: '',
  title_prefix: '',
  type: 'udr',
  sequence_mode: 'incremental',
  next_sequence_no: '1',
  date_anchor: '',
  date_anchor_sequence_no: '',
  is_active: true,
  include_in_daily_activities: false,
  sort_order: '999',
};

const DEFAULT_PHOTO_REPORT_LOGO_URL =
  'https://juupotamdjqzpxuqdtco.supabase.co/storage/v1/object/public/pr_ingenit/puma/puma.png';

const DEFAULT_PHOTO_REPORT_BACKGROUND_URL =
  'https://juupotamdjqzpxuqdtco.supabase.co/storage/v1/object/public/pr_ingenit/puma/background_blue.jpeg';
const DEFAULT_PHOTO_REPORT_PAGE2_BACKGROUND_URL =
  'https://juupotamdjqzpxuqdtco.supabase.co/storage/v1/object/public/pr_ingenit/puma/background.jpeg';
const DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL =
  'https://juupotamdjqzpxuqdtco.supabase.co/storage/v1/object/public/pr_ingenit/puma/background_gral.jpg';
const DEFAULT_PHOTO_REPORT_FINAL_COMPANY_LOGO_URL =
  'https://juupotamdjqzpxuqdtco.supabase.co/storage/v1/object/public/pr_ingenit/puma/LI-In-Bug.png';

const MANAGEMENT_TIME_REASON_OPTIONS: Record<string, string[]> = {
  Productivas: [
    'Avance ejecutado / medicion realizada',
  ],
  'Tiempo contributivo': [
    'Control de acceso / paleteros / señaleros / Portería',
    'Trabajos menores de apoyo',
    'Trabajos menores con maquinaria',
    'Instalación de Faena y Puntos de Trabajo (Construcción y/o mantenimiento)',
    'Charlas / Capacitaciones / Cursos / Reunión OBS',
    'Traslado de equipos / Escoltas',
    'Retiro de materiales sobrantes a botaderos',
    'Orden y aseo',
    'Planificación de los trabajos a realizar',
    'Mantención de Equipos',
  ],
  'Tiempo no contributivo': [
    'Desmovilización',
    'Espera Traslado Personal',
    'Falta de suministro, materiales y/o herramientas',
    'Documentos Seguridad / Falta documentación / Falta de cursos',
    'PUMA - Interferencias / Trabajos cruzados / Falta Permisos / Falta liberación de especialidad previa',
    'CLIENTE - Interferencias / Trabajos cruzados / Falta Permisos / Falta Liberacion de áreas',
    'Condiciones climatológicas adversas',
    'Tiempos muertos / Sin postura / Sin frente de trabajo',
  ],
};

const DEFAULT_INTERFERENCE_FORM: InterferenceFormState = {
  workFront: '',
  timeType: 'Tiempo no contributivo',
  timeDetail: 'Desmovilización',
  date: new Date().toISOString().slice(0, 10),
  startTime: '',
  endTime: '',
  note: '',
};

const isIndirectPosition = (position: any) => {
  const text = normalizeLabel(position);
  if (!text) return false;
  return [
    'ADMINISTR',
    'ALARIFE',
    'ASESOR',
    'ASISTENTE',
    'BODEG',
    'CHOFER',
    'CONDUCTOR',
    'CONTROL DOCUMENT',
    'COORDINADOR',
    'ENCARGADO',
    'JEFE',
    'MANTENCION',
    'MECANICO',
    'ELECTRICO MANTENCION',
    'OPERADOR',
    'PANOL',
    'PREVENC',
    'SECRETARIO',
    'SUPERVIS',
    'TOPOGRAF',
  ].some((needle) => text.includes(needle));
};

const isDirectWorkerRow = (row: any) => {
  const positionText = normalizeLabel(row?.position || row?.role || row?.cargo || '');
  // Business rule: Nivelador siempre se considera indirecto en este resumen.
  if (positionText.includes('NIVELADOR')) return false;

  const workerType = normalizeText(row?.worker_type || row?.workerType || row?.type || '');
  if (workerType) {
    if (workerType.includes('indirect')) return false;
    if (workerType.includes('directo no operacional')) return false;
    if (workerType.includes('direct')) return true;
  }
  // Legacy fallback only when worker_type is missing.
  return !isIndirectPosition(positionText);
};

const inferSpecialtyFromPosition = (position: any) => {
  const text = normalizeText(position);
  if (!text) return '';
  if (text.includes('rigger')) return 'RIGGER';
  if (text.includes('electric')) return 'ELECTRICO';
  if (text.includes('caner') || text.includes('caner') || text.includes('hdpe') || text.includes('tuber')) return 'CAÑERIA';
  if (text.includes('mecanic')) return 'MECANICO';
  if (
    text.includes('civil') ||
    text.includes('maestro') ||
    text.includes('jornal') ||
    text.includes('ayudante') ||
    text.includes('carpinter') ||
    text.includes('enfierr') ||
    text.includes('hormigon') ||
    text.includes('albanil')
  ) {
    return 'OBRAS CIVILES';
  }
  return '';
};

const getReportSpecialty = (report: FieldReportRecord) =>
  normalizeLabel(report?.specialty || report?.especialidad || report?.discipline || 'SIN ESPECIALIDAD');

const getDirectRowSpecialty = (row: any, report: FieldReportRecord) => {
  const explicit = normalizeLabel(row?.specialty || row?.especialidad || row?.discipline || row?.disciplina || '');
  if (explicit) return explicit;

  const position = row?.position || row?.role || row?.cargo || '';
  const inferred = inferSpecialtyFromPosition(position);
  const reportSpecialty = getReportSpecialty(report);

  if (inferred) return inferred;
  if (reportSpecialty === 'RIGGER') return 'OBRAS CIVILES';
  return reportSpecialty || 'SIN ESPECIALIDAD';
};

const getPersonKey = (row: any, idx: number) => {
  const strongId = String(row?.personId || row?.id || row?.collaborator_id || row?.user_id || '').trim();
  if (strongId) return strongId;

  const doc = String(row?.document || row?.rut || row?.dni || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (doc) return `DOC:${doc}`;

  const name = String(getPersonName(row) || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const position = String(row?.position || row?.role || row?.cargo || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (name) return `NAME:${name}|POS:${position || '-'}`;

  return `person-${idx}`;
};

const getPersonName = (row: any) => {
  const first = String(row?.first_name || row?.firstName || '').trim();
  const last = String(row?.last_name || row?.lastName || '').trim();
  const full = `${first} ${last}`.replace(/\s+/g, ' ').trim();
  if (full) return full.toUpperCase();
  return String(row?.name || row?.full_name || row?.worker_name || '').trim().toUpperCase() || 'SIN NOMBRE';
};

const getPersonHourCandidateKeys = (row: any, idx: number) => {
  const keys: string[] = [];
  const add = (value: any) => {
    const key = String(value || '').trim();
    if (key && !keys.includes(key)) keys.push(key);
  };

  add(getPersonKey(row, idx));
  add(row?.personId);
  add(row?.id);
  add(row?.collaborator_id);
  add(row?.user_id);
  add(`person-${idx}`);

  const doc = String(row?.document || row?.rut || row?.dni || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (doc) add(`DOC:${doc}`);

  const name = getPersonName(row);
  const position = String(row?.position || row?.role || row?.cargo || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (name && name !== 'SIN NOMBRE') add(`NAME:${name}|POS:${position || '-'}`);

  return keys;
};

const getPersonHoursForRow = (personHours: Record<string, any>, row: any, idx: number) => {
  const keys = getPersonHourCandidateKeys(row, idx);
  for (const key of keys) {
    if (Array.isArray(personHours?.[key])) return personHours[key];
  }
  return [];
};

const getPersonExtraHoursForRow = (extras: Record<string, any>, row: any, idx: number) => {
  const keys = getPersonHourCandidateKeys(row, idx);
  for (const key of keys) {
    if (extras?.[key] !== undefined && extras?.[key] !== null) return toNumber(extras[key]);
  }
  return 0;
};

const getReportDirectRows = (report: FieldReportRecord) => {
  const personnel = parseJsonMaybe(report?.personnel);
  const personHoursRaw = parseJsonMaybe(report?.person_hours);
  const personHours = personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw)
    ? { ...personHoursRaw }
    : {};
  const extras = personHours.__extras && typeof personHours.__extras === 'object'
    ? personHours.__extras
    : {};
  delete personHours.__extras;

  const rows = Array.isArray(personnel) ? personnel : [];
  const directRows: Array<{ personKey: string; specialty: string; position: string; hh: number; hhExtras: number; name: string; document: string }> = [];

  rows.forEach((row: any, idx: number) => {
    const position = row?.position || row?.role || row?.cargo || '';
    if (!isDirectWorkerRow(row)) return;

    const key = getPersonKey(row, idx);
    const hours = getPersonHoursForRow(personHours, row, idx);
    const extra = getPersonExtraHoursForRow(extras, row, idx);
    const hh = hours.reduce((acc: number, value: any) => acc + toNumber(value), 0);
    const total = hh + extra;
    if (total <= 0) return;

    directRows.push({
      personKey: key,
      specialty: getDirectRowSpecialty(row, report),
      position: normalizeLabel(position || 'SIN CARGO'),
      hh,
      hhExtras: extra,
      name: getPersonName(row),
      document: normalizeLabel(row?.document || row?.rut || row?.dni || ''),
    });
  });

  return directRows;
};

const getExplicitAssignmentFrontLabel = (row: any) =>
  normalizeLabel(row?.activity_front || row?.work_front || row?.front || row?.frente || '');

const isBaseFrontLabel = (front: string) =>
  front === 'CANALETAS' ||
  front === 'PISCINAS' ||
  front.includes('CONTRATO BASE CANALETAS') ||
  front.includes('CONTRATO BASE PISCINAS');

const getFrontLabelFromCrewName = (report: FieldReportRecord) => {
  const crew = normalizeLabel(report?.crew_name || '');
  const front = crew.replace(/^CUADRILLA\s+\d+\s+/, '').trim();
  if (!front || isBaseFrontLabel(front)) return '';
  return front.includes('NOC') || front.includes('USO DE RECURSOS') || front.includes('EJECUCION')
    ? front
    : '';
};

const getReportLevelFrontLabel = (report: FieldReportRecord) => {
  const explicit = normalizeLabel(
    report?.work_front ||
    report?.front ||
    report?.frente ||
    report?.front_name ||
    report?.report_title ||
    report?.contract_name ||
    report?.contract ||
    ''
  );
  const crewFront = getFrontLabelFromCrewName(report);
  if (explicit && isBaseFrontLabel(explicit) && crewFront) return crewFront;
  return explicit;
};

const getFrontLabelForRow = (row: any, report: FieldReportRecord) => {
  return normalizeLabel(
    row?.activity_front ||
    row?.work_front ||
    row?.front ||
    row?.frente ||
    getReportLevelFrontLabel(report) ||
    'SIN FRENTE'
  );
};

const getFrontLabelForAssignmentHour = (row: any, report: FieldReportRecord, strictBaseFront: string) => {
  const assignmentFront = getExplicitAssignmentFrontLabel(row);
  if (assignmentFront && (!strictBaseFront || !isBaseFrontLabel(assignmentFront))) return assignmentFront;
  if (strictBaseFront) return strictBaseFront;
  return getFrontLabelForRow(null, report);
};

const getReportDirectFrontRows = (report: FieldReportRecord) => {
  const personnel = parseJsonMaybe(report?.personnel);
  const personHoursRaw = parseJsonMaybe(report?.person_hours);
  const personHours = personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw)
    ? { ...personHoursRaw }
    : {};
  const extras = personHours.__extras && typeof personHours.__extras === 'object'
    ? personHours.__extras
    : {};
  delete personHours.__extras;

  const assignments = parseJsonMaybe(report?.assignments);
  const assignmentRows = Array.isArray(assignments) ? assignments : [];
  const reportFrontNormalized = getFrontLabelForRow(null, report);
  const isBaseCanaletas = reportFrontNormalized.includes('CONTRATO BASE CANALETAS') || reportFrontNormalized === 'CANALETAS';
  const isBasePiscinas = reportFrontNormalized.includes('CONTRATO BASE PISCINAS') || reportFrontNormalized === 'PISCINAS';
  const strictBaseFront = isBaseCanaletas ? 'CONTRATO BASE CANALETAS' : (isBasePiscinas ? 'CONTRATO BASE PISCINAS' : '');
  const rows = Array.isArray(personnel) ? personnel : [];
  const out: Array<{ front: string; specialty: string; hh: number; hhExtras: number; personKey: string; directCount: number }> = [];

  rows.forEach((row: any, idx: number) => {
    const position = row?.position || row?.role || row?.cargo || '';
    if (!isDirectWorkerRow(row)) return;

    const key = getPersonKey(row, idx);
    const specialty = getDirectRowSpecialty(row, report);
    const hours = getPersonHoursForRow(personHours, row, idx);
    const extra = getPersonExtraHoursForRow(extras, row, idx);

    let hhTotal = 0;
    const hhByFront = new Map<string, number>();
    hours.forEach((value: any, hourIdx: number) => {
      const parsed = toNumber(value);
      if (parsed <= 0) return;
      hhTotal += parsed;
      const front = getFrontLabelForAssignmentHour(assignmentRows[hourIdx], report, strictBaseFront);
      hhByFront.set(front, Number(hhByFront.get(front) || 0) + parsed);
    });

    if (hhTotal <= 0 && extra <= 0) return;

    if (hhTotal > 0) {
      const rankedFronts = Array.from(hhByFront.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return a[0].localeCompare(b[0], 'es');
        });
      const primaryFront = rankedFronts[0]?.[0] || '';
      hhByFront.forEach((frontHh, front) => {
        const ratio = frontHh / hhTotal;
        out.push({
          front,
          specialty,
          hh: frontHh,
          hhExtras: extra > 0 ? extra * ratio : 0,
          personKey: key,
          directCount: front === primaryFront ? 1 : 0,
        });
      });
      return;
    }

    const fallbackFront = strictBaseFront || getFrontLabelForRow(null, report);
    out.push({ front: fallbackFront, specialty, hh: 0, hhExtras: extra, personKey: key, directCount: 1 });
  });

  return out;
};

const getReportPersonnelFrontRows = (report: FieldReportRecord) => {
  const personnel = parseJsonMaybe(report?.personnel);
  const personHoursRaw = parseJsonMaybe(report?.person_hours);
  const personHours = personHoursRaw && typeof personHoursRaw === 'object' && !Array.isArray(personHoursRaw)
    ? { ...personHoursRaw }
    : {};
  const extras = personHours.__extras && typeof personHours.__extras === 'object'
    ? personHours.__extras
    : {};
  delete personHours.__extras;

  const assignments = parseJsonMaybe(report?.assignments);
  const assignmentRows = Array.isArray(assignments) ? assignments : [];
  const rows = Array.isArray(personnel) ? personnel : [];

  const out: Array<{
    personKey: string;
    name: string;
    position: string;
    workerType: string;
    rut: string;
    front: string;
    hh: number;
    hhExtras: number;
    sourceIndex: number;
  }> = [];

  rows.forEach((row: any, idx: number) => {
    const key = getPersonKey(row, idx);
    const hours = getPersonHoursForRow(personHours, row, idx);
    const extra = getPersonExtraHoursForRow(extras, row, idx);
    const hhByFront = new Map<string, number>();
    let hhTotal = 0;

    hours.forEach((value: any, hourIdx: number) => {
      const parsed = toNumber(value);
      if (parsed <= 0) return;
      hhTotal += parsed;
      const front = getFrontLabelForRow(assignmentRows[hourIdx], report);
      hhByFront.set(front, Number(hhByFront.get(front) || 0) + parsed);
    });

    const common = {
      personKey: key,
      name: getPersonName(row),
      position: normalizeLabel(row?.position || row?.role || row?.cargo || 'SIN CARGO'),
      workerType: normalizeLabel(row?.worker_type || row?.workerType || row?.type || '') || (isDirectWorkerRow(row) ? 'DIRECTO' : 'INDIRECTO'),
      rut: normalizeLabel(row?.document || row?.rut || row?.dni || ''),
      sourceIndex: idx + 1,
    };

    if (hhByFront.size === 0) {
      out.push({
        ...common,
        front: getFrontLabelForRow(row, report),
        hh: 0,
        hhExtras: extra,
      });
      return;
    }

    hhByFront.forEach((frontHh, front) => {
      const ratio = hhTotal > 0 ? frontHh / hhTotal : 0;
      out.push({
        ...common,
        front,
        hh: frontHh,
        hhExtras: extra > 0 ? extra * ratio : 0,
      });
    });
  });

  return out;
};

const splitResponsibleNames = (value: any) => {
  return String(value || '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const readResponsibleRows = (report: FieldReportRecord) => {
  const sources = [
    report?.responsible_personnel,
    report?.responsiblePersonnel,
    report?.responsible_people,
    report?.responsiblePeople,
    report?.crew_responsible_people,
    report?.crewResponsiblePeople,
    report?.responsibles,
    report?.responsables,
  ];
  const crewResponsible = parseJsonMaybe(report?.crew_responsible || report?.crewResponsible);
  if (crewResponsible && typeof crewResponsible === 'object') {
    sources.push(crewResponsible?.people, crewResponsible?.supervisors);
  }

  const rows: any[] = [];
  sources.forEach((source) => {
    const parsed = parseJsonMaybe(source);
    if (Array.isArray(parsed)) rows.push(...parsed);
    else if (parsed && typeof parsed === 'object') rows.push(parsed);
  });
  return rows;
};

const parseResponsibleNamePosition = (value: string, fallbackPosition: string) => {
  const raw = String(value || '').trim();
  if (!raw) return { name: '', position: fallbackPosition };
  const cleaned = raw
    .replace(/^supervisor\s*:\s*/i, '')
    .replace(/^capataz\s*:\s*/i, '')
    .trim();
  const parts = cleaned.split(/\s+-\s+/);
  const name = String(parts[0] || raw).trim();
  const position = String(parts.slice(1).join(' - ') || fallbackPosition).trim();
  return {
    name: normalizeUppercaseDisplayText(name || raw),
    position: normalizeLabel(position || fallbackPosition),
  };
};

const isLikelyRawId = (value: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const getReportSupervisorRows = (
  report: FieldReportRecord,
  existingNames: Set<string>,
  collaboratorLookupById?: Map<string, any>
) => {
  const reportFront = getFrontLabelForRow(null, report);
  const responsibleRows = readResponsibleRows(report);
  const structuredSupervisorRows = responsibleRows.reduce<Array<{
    personKey: string;
    name: string;
    position: string;
    workerType: string;
    rut: string;
    front: string;
    hh: number;
    hhExtras: number;
    sourceIndex: number;
  }>>((acc, row: any, idx: number) => {
    const role = normalizeText(row?.role || row?.responsibility || row?.type || row?.position || row?.cargo || '');
    const rawName = row && typeof row === 'object'
      ? getPersonName(row)
      : String(row || '').trim();
    const parsed = parseResponsibleNamePosition(rawName, 'SUPERVISOR');
    const name = parsed.name;
    const nameRole = normalizeText(rawName);
    const isSupervisor = role.includes('supervisor') || role.includes('jefe') || role.includes('coordinador') ||
      nameRole.startsWith('supervisor') || nameRole.startsWith('jefe') || nameRole.startsWith('coordinador');
    if (!isSupervisor || !name || name === 'SIN NOMBRE' || isLikelyRawId(name)) return acc;
    const key = normalizeText(name);
    if (!key || existingNames.has(key)) return acc;
    existingNames.add(key);
    acc.push({
      personKey: String(row?.personKey || row?.personId || row?.id || `SUPERVISOR:${key}`),
      name,
      position: normalizeLabel(row?.position || row?.cargo || row?.role || parsed.position || 'SUPERVISOR'),
      workerType: normalizeLabel(row?.worker_type || row?.workerType || row?.type || '') || 'INDIRECTO',
      rut: normalizeLabel(row?.document || row?.rut || row?.dni || ''),
      front: reportFront || 'SIN FRENTE',
      hh: 0,
      hhExtras: 0,
      sourceIndex: 8800 + idx,
    });
    return acc;
  }, []);

  const supervisorNames = Array.from(new Set([
    ...splitResponsibleNames(report?.supervisor_id),
    ...splitResponsibleNames(report?.supervisor_ids),
    ...splitResponsibleNames(report?.supervisor),
    ...splitResponsibleNames(report?.supervisor_name),
    ...splitResponsibleNames(report?.supervisor_display_name),
    ...splitResponsibleNames(report?.supervisors),
  ]));

  return supervisorNames.reduce<Array<{
    personKey: string;
    name: string;
    position: string;
    workerType: string;
    rut: string;
    front: string;
    hh: number;
    hhExtras: number;
    sourceIndex: number;
  }>>((acc, rawName, idx) => {
    if (isLikelyRawId(rawName)) {
      const collaborator = collaboratorLookupById?.get(String(rawName || '').trim());
      if (!collaborator) return acc;
      const name = getPersonName(collaborator);
      const key = normalizeText(name);
      if (!key || name === 'SIN NOMBRE' || existingNames.has(key)) return acc;
      existingNames.add(key);
      acc.push({
        personKey: `SUPERVISOR:${String(collaborator?.id || rawName).trim()}`,
        name,
        position: normalizeLabel(collaborator?.position || 'SUPERVISOR'),
        workerType: normalizeLabel(collaborator?.worker_type || collaborator?.workerType || '') || 'INDIRECTO',
        rut: normalizeLabel(collaborator?.document || collaborator?.rut || collaborator?.dni || '-'),
        front: reportFront || 'SIN FRENTE',
        hh: 0,
        hhExtras: 0,
        sourceIndex: 9000 + idx,
      });
      return acc;
    }
    const parsed = parseResponsibleNamePosition(rawName, 'SUPERVISOR');
    const key = normalizeText(parsed.name);
    if (!key || existingNames.has(key)) return acc;
    existingNames.add(key);
    acc.push({
      personKey: `SUPERVISOR:${key}`,
      name: parsed.name,
      position: parsed.position || 'SUPERVISOR',
      workerType: 'INDIRECTO',
      rut: '-',
      front: reportFront || 'SIN FRENTE',
      hh: 0,
      hhExtras: 0,
      sourceIndex: 9000 + idx,
    });
    return acc;
  }, structuredSupervisorRows);
};

const upsertGroup = (
  map: Map<string, GroupSummary>,
  label: string,
  hh: number,
  hhExtras = 0,
  reports = 1,
  peopleRowsIncrement = 1
) => {
  const key = normalizeLabel(label || 'SIN DEFINIR');
  const current = map.get(key) || { label: key, hh: 0, hhExtras: 0, peopleRows: 0, reports: 0 };
  current.hh += hh;
  current.hhExtras += hhExtras;
  current.peopleRows += Number(peopleRowsIncrement || 0);
  current.reports += reports;
  map.set(key, current);
};

const sortGroups = (groups: GroupSummary[]) => {
  return groups.sort((a, b) => {
    if (b.hh !== a.hh) return b.hh - a.hh;
    return a.label.localeCompare(b.label, 'es');
  });
};

export default function ManagementPage() {
  const { notify } = useAppSnackbar();
  const { data: session, status: sessionStatus } = useSession();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isActivitiesCompact = useMediaQuery(theme.breakpoints.down('md'));
  const [reports, setReports] = useState<FieldReportRecord[]>([]);
  const [hhSummary, setHhSummary] = useState<HhSummaryPayload | null>(null);
  const [collaboratorRows, setCollaboratorRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const MANAGEMENT_TAB_STORAGE_KEY = 'management_active_tab_v1';
  const [activeTab, setActiveTab] = useState<ManagementTab>(() => {
    if (typeof window === 'undefined') return 'hh';
    const saved = String(window.localStorage.getItem(MANAGEMENT_TAB_STORAGE_KEY) || '').trim();
    return isManagementTab(saved) ? saved : 'hh';
  });
  const [managementPermissionKeys, setManagementPermissionKeys] = useState<string[] | null>(null);
  const [hhAvailableDates, setHhAvailableDates] = useState<string[]>([]);
  const [hhMatrixStartDate, setHhMatrixStartDate] = useState('');
  const [hhMatrixEndDate, setHhMatrixEndDate] = useState('');
  const [hhSummaryReloadNonce, setHhSummaryReloadNonce] = useState(0);
  const [hhMatrixDialogOpen, setHhMatrixDialogOpen] = useState(false);
  const [hhMatrixRangeAnchorEl, setHhMatrixRangeAnchorEl] = useState<HTMLElement | null>(null);
  const [hhMatrixTempStartDate, setHhMatrixTempStartDate] = useState<Date | null>(null);
  const [hhMatrixTempEndDate, setHhMatrixTempEndDate] = useState<Date | null>(null);
  const [hhMatrixSort, setHhMatrixSort] = useState<HhMatrixSort>({ key: 'specialty', direction: 'asc' });
  const [hhMatrixFrontFilter, setHhMatrixFrontFilter] = useState('');
  const [hhMatrixNonBaseFrontFilter, setHhMatrixNonBaseFrontFilter] = useState('');
  const [hhMatrixSpecialtyFilter, setHhMatrixSpecialtyFilter] = useState('');
  const [hhMatrixPositionFilter, setHhMatrixPositionFilter] = useState('');
  const hhMatrixRangeHydratedFromSummaryRef = useRef(false);
  const hhMatrixManualRangeChangeRef = useRef(false);
  const [crewPersonnelDateFilter, setCrewPersonnelDateFilter] = useState('');
  const [crewPersonnelDateAnchorEl, setCrewPersonnelDateAnchorEl] = useState<HTMLElement | null>(null);
  const [crewPersonnelFrontFilter, setCrewPersonnelFrontFilter] = useState('');
  const [crewPersonnelTypeFilter, setCrewPersonnelTypeFilter] = useState('');
  const [crewPersonnelHhFilter, setCrewPersonnelHhFilter] = useState('');
  const [crewPersonnelExtraHhFilter, setCrewPersonnelExtraHhFilter] = useState('');
  const [crewPersonnelSearch, setCrewPersonnelSearch] = useState('');
  const [crewPersonnelExporting, setCrewPersonnelExporting] = useState(false);
  const [activitiesSearch, setActivitiesSearch] = useState('');
  const [activitiesSearchQuery, setActivitiesSearchQuery] = useState('');
  const [activitiesAvailableDates, setActivitiesAvailableDates] = useState<string[]>([]);
  const [activitiesWeekRange, setActivitiesWeekRange] = useState(() => getWeekRangeFromDateKey(dateToKey(new Date())));
  const [activitiesWeeksReady, setActivitiesWeeksReady] = useState(false);
  const [interferenceDialogOpen, setInterferenceDialogOpen] = useState(false);
  const [interferenceSaving, setInterferenceSaving] = useState(false);
  const [interferenceForm, setInterferenceForm] = useState<InterferenceFormState>(DEFAULT_INTERFERENCE_FORM);
  const [interferenceFiles, setInterferenceFiles] = useState<File[]>([]);
  const [interferences, setInterferences] = useState<ManagementInterferenceRecord[]>([]);
  const [interferencesLoading, setInterferencesLoading] = useState(false);
  const [interferencesError, setInterferencesError] = useState('');
  const [historicalHhRows, setHistoricalHhRows] = useState<HistoricalHhRecord[]>([]);
  const [historicalHhLoading, setHistoricalHhLoading] = useState(false);
  const [historicalHhError, setHistoricalHhError] = useState('');
  const [historicalHhExportingFront, setHistoricalHhExportingFront] = useState('');
  const [equipmentDate, setEquipmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [equipmentAvailableDates, setEquipmentAvailableDates] = useState<string[]>([]);
  const [equipmentLoadedFromDate, setEquipmentLoadedFromDate] = useState<string>('');
  const [equipmentLastUpdatedAt, setEquipmentLastUpdatedAt] = useState<string>('');
  const [equipmentLastUpdatedBy, setEquipmentLastUpdatedBy] = useState<string>('');
  const [equipmentDateAnchorEl, setEquipmentDateAnchorEl] = useState<HTMLElement | null>(null);
  const [equipmentRows, setEquipmentRows] = useState<ManagementEquipmentRow[]>([]);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentNamePinned, setEquipmentNamePinned] = useState(true);
  const [equipmentPatentPinned, setEquipmentPatentPinned] = useState(true);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [equipmentError, setEquipmentError] = useState('');
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  const [equipmentModalMode, setEquipmentModalMode] = useState<'create' | 'edit'>('create');
  const [editingEquipmentIndex, setEditingEquipmentIndex] = useState<number | null>(null);
  const [equipmentDraft, setEquipmentDraft] = useState<ManagementEquipmentRow | null>(null);
  const [equipmentInitialDraft, setEquipmentInitialDraft] = useState<ManagementEquipmentRow | null>(null);
  const [equipmentEffectiveDate, setEquipmentEffectiveDate] = useState('');
  const [equipmentNameCustomMode, setEquipmentNameCustomMode] = useState(false);
  const [equipmentPropagationConfirm, setEquipmentPropagationConfirm] = useState<{
    rows: ManagementEquipmentRow[];
    targetDate: string;
    successMessage: string;
    identityKeys: string[];
    futureDates: string[];
  } | null>(null);
  const [reportFronts, setReportFronts] = useState<ReportFrontRow[]>([]);
  const [reportFrontsLoading, setReportFrontsLoading] = useState(false);
  const [reportFrontsError, setReportFrontsError] = useState('');
  const [reportFrontDialogOpen, setReportFrontDialogOpen] = useState(false);
  const [reportFrontSaving, setReportFrontSaving] = useState(false);
  const [reportFrontDraft, setReportFrontDraft] = useState<ReportFrontDraft>(DEFAULT_REPORT_FRONT_DRAFT);
  const [dailyActivitiesConfirmFront, setDailyActivitiesConfirmFront] = useState<ReportFrontRow | null>(null);
  const [photoCoverTitle, setPhotoCoverTitle] = useState('P-4291: "Contratos de Construccion GPRO 2025_2026"');
  const [photoPeriodStartDate, setPhotoPeriodStartDate] = useState('');
  const [photoPeriodEndDate, setPhotoPeriodEndDate] = useState('');
  const [photoCoverReportNo, setPhotoCoverReportNo] = useState('');
  const [photoRangeDialogOpen, setPhotoRangeDialogOpen] = useState(false);
  const [photoTempStartDate, setPhotoTempStartDate] = useState<Date | null>(null);
  const [photoTempEndDate, setPhotoTempEndDate] = useState<Date | null>(null);
  const [photoCoverBackgroundUrl, setPhotoCoverBackgroundUrl] = useState(DEFAULT_PHOTO_REPORT_BACKGROUND_URL);
  const [photoCoverLogoUrl, setPhotoCoverLogoUrl] = useState(DEFAULT_PHOTO_REPORT_LOGO_URL);
  const [photoPage2BackgroundUrl, setPhotoPage2BackgroundUrl] = useState(DEFAULT_PHOTO_REPORT_PAGE2_BACKGROUND_URL);
  const [photoPage3BackgroundUrl, setPhotoPage3BackgroundUrl] = useState(DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL);
  const [photoPage3AreaTitle, setPhotoPage3AreaTitle] = useState('ÁREA CANALETAS');
  const [photoPiscinasAreaTitle, setPhotoPiscinasAreaTitle] = useState('ÁREA PISCINAS');
  const [photoAdicionalesAreaTitle, setPhotoAdicionalesAreaTitle] = useState('ADICIONALES');
  const [photoKeywordFilter, setPhotoKeywordFilter] = useState('');
  const [photoSlideTitleOverrides, setPhotoSlideTitleOverrides] = useState<Record<string, string>>({});
  const [photoPreviewSlide, setPhotoPreviewSlide] = useState(0);
  const [photoPreviewTransitionEnabled, setPhotoPreviewTransitionEnabled] = useState(true);
  const [photoExporting, setPhotoExporting] = useState(false);
  const [photoEvidencePreviewByKey, setPhotoEvidencePreviewByKey] = useState<Record<string, string>>({});
  const [photoEvidenceRatioByKey, setPhotoEvidenceRatioByKey] = useState<Record<string, number>>({});
  const [includedPhotoEvidenceKeys, setIncludedPhotoEvidenceKeys] = useState<Record<string, true>>({});
  const [photoExportRangeStart, setPhotoExportRangeStart] = useState('');
  const [photoExportRangeEnd, setPhotoExportRangeEnd] = useState('');
  const [photoConfigHydratedKey, setPhotoConfigHydratedKey] = useState('');
  const [savedPhotoConfigs, setSavedPhotoConfigs] = useState<SavedPhotoReportConfig[]>([]);
  const [selectedSavedPhotoConfigId, setSelectedSavedPhotoConfigId] = useState('');
  const [savedPhotoConfigsLoading, setSavedPhotoConfigsLoading] = useState(false);
  const [photoConfigDirty, setPhotoConfigDirty] = useState(false);
  const [photoConfigSaving, setPhotoConfigSaving] = useState(false);
  const [photoConfigExistsForScope, setPhotoConfigExistsForScope] = useState(false);
  const [photoRestoreDialogOpen, setPhotoRestoreDialogOpen] = useState(false);
  const [photoRestoreSelection, setPhotoRestoreSelection] = useState<Record<string, true>>({});
  const [photoRestoreSelectionOrder, setPhotoRestoreSelectionOrder] = useState<string[]>([]);
  const [photoSelectFrontFilter, setPhotoSelectFrontFilter] = useState('');
  const [photoSelectModuleFilter, setPhotoSelectModuleFilter] = useState('');
  const [photoSelectActivityFilter, setPhotoSelectActivityFilter] = useState('');
  const [photoZoomEvidenceKey, setPhotoZoomEvidenceKey] = useState('');
  const [includedPhotoEvidenceOrder, setIncludedPhotoEvidenceOrder] = useState<string[]>([]);
  const setNotice = React.useCallback((notice: { message: string; severity: 'success' | 'error' | 'info' }) => notify(notice.message, { severity: notice.severity }), [notify]);
  const sessionRole = String(session?.user?.role || '').trim().toLowerCase();
  const sessionPermissionKeys = useMemo(
    () => Array.isArray(session?.user?.permissions)
      ? session.user.permissions.map((permission: unknown) => String(permission))
      : [],
    [session?.user],
  );
  const effectiveManagementPermissionKeys = managementPermissionKeys ?? sessionPermissionKeys;
  const allowedManagementTabs = useMemo(
    () => resolveAllowedManagementTabs(effectiveManagementPermissionKeys, sessionRole),
    [effectiveManagementPermissionKeys, sessionRole],
  );
  const allowedManagementTabSet = useMemo(() => new Set<ManagementTab>(allowedManagementTabs), [allowedManagementTabs]);
  const managementAccessResolved = sessionRole === 'admin' || sessionRole === 'dev' || managementPermissionKeys !== null;
  const activeTabAllowed = managementAccessResolved && allowedManagementTabSet.has(activeTab);
  const equipmentAvailableDatesSet = useMemo(() => new Set(equipmentAvailableDates), [equipmentAvailableDates]);
  const needsDetailedReports = activeTab === 'crew-personnel' || activeTab === 'activities' || activeTab === 'photo-report';
  const isActivitiesGlobalSearch = activeTab === 'activities' && activitiesSearch.trim().length > 0;
  const hasActivitiesSearchQuery = activeTab === 'activities' && activitiesSearchQuery.trim().length > 0;

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionStatus !== 'authenticated') {
      setManagementPermissionKeys([]);
      return;
    }
    if (sessionRole === 'admin' || sessionRole === 'dev') {
      setManagementPermissionKeys(['*']);
      return;
    }

    let cancelled = false;
    fetch('/api/session/permissions', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar los permisos.');
        return Array.isArray(payload?.permissions)
          ? payload.permissions.map((permission: unknown) => String(permission))
          : [];
      })
      .then((permissions) => {
        if (!cancelled) setManagementPermissionKeys(permissions);
      })
      .catch(() => {
        if (!cancelled) setManagementPermissionKeys(sessionPermissionKeys);
      });

    return () => { cancelled = true; };
  }, [sessionPermissionKeys, sessionRole, sessionStatus]);

  useEffect(() => {
    if (!managementAccessResolved || allowedManagementTabs.length === 0) return;
    if (!allowedManagementTabSet.has(activeTab)) setActiveTab(allowedManagementTabs[0]);
  }, [activeTab, allowedManagementTabSet, allowedManagementTabs, managementAccessResolved]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeTabAllowed) return;
    window.localStorage.setItem(MANAGEMENT_TAB_STORAGE_KEY, activeTab);
  }, [activeTab, activeTabAllowed]);

  useEffect(() => {
    if (activeTab !== 'activities') {
      setActivitiesSearchQuery('');
      return;
    }
    const timeout = window.setTimeout(() => {
      setActivitiesSearchQuery(activitiesSearch.trim());
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [activeTab, activitiesSearch]);

  const createEmptyEquipmentRow = (kind: EquipmentKind): ManagementEquipmentRow => ({
    report_date: equipmentDate,
    equipment_kind: kind,
    equipment_name: '',
    patent: '',
    quantity: 1,
    canaletas_qty: 0,
    piscinas_qty: 0,
    is_operational: false,
    in_maintenance: false,
    in_accreditation: false,
    in_breakdown: false,
    include_in_daily_report: true,
    entry_date: equipmentDate,
    return_date: null,
    mileage_km: null,
    notes: '',
  });
  const equipmentIdentityKey = (row: Pick<ManagementEquipmentRow, 'equipment_kind' | 'equipment_name' | 'patent'>) => {
    const kind = String(row.equipment_kind || '').trim().toUpperCase() === 'MENOR' ? 'MENOR' : 'MAYOR';
    const name = String(row.equipment_name || '').trim().toLowerCase();
    const patent = String(row.patent || '').trim().toLowerCase();
    return `${kind}__${name}__${patent}`;
  };
  const isSameEquipment = (
    left: Pick<ManagementEquipmentRow, 'equipment_kind' | 'equipment_name' | 'patent'>,
    right: Pick<ManagementEquipmentRow, 'equipment_kind' | 'equipment_name' | 'patent'>
  ) => {
    const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('es-CL').replace(/\s+/g, ' ');
    const leftPatent = normalize(left.patent).replace(/[^a-z0-9]/g, '');
    const rightPatent = normalize(right.patent).replace(/[^a-z0-9]/g, '');
    if (leftPatent && rightPatent) return leftPatent === rightPatent;
    return (
      String(left.equipment_kind || '').toUpperCase() === String(right.equipment_kind || '').toUpperCase() &&
      normalize(left.equipment_name) === normalize(right.equipment_name) &&
      !leftPatent &&
      !rightPatent
    );
  };
  const normalizeEquipmentApiRows = (rows: any[], snapshotDate: string): ManagementEquipmentRow[] => {
    const normalizedRows: ManagementEquipmentRow[] = (Array.isArray(rows) ? rows : []).map((row: any) => {
      const rawKind = String(row?.equipment_kind || '').trim().toUpperCase();
      const kind: EquipmentKind = rawKind === 'MENOR' ? 'MENOR' : 'MAYOR';
      return {
        id: row?.id,
        report_date: String(row?.report_date || snapshotDate || ''),
        equipment_kind: kind,
        equipment_name: String(row?.equipment_name || ''),
        patent: String(row?.patent || ''),
        quantity: row?.quantity === null || row?.quantity === undefined || String(row?.quantity).trim() === '' ? 1 : Number(row?.quantity || 1),
        canaletas_qty: row?.canaletas_qty === null || row?.canaletas_qty === undefined || String(row?.canaletas_qty).trim() === '' ? 0 : Number(row?.canaletas_qty || 0),
        piscinas_qty: row?.piscinas_qty === null || row?.piscinas_qty === undefined || String(row?.piscinas_qty).trim() === '' ? 0 : Number(row?.piscinas_qty || 0),
        is_operational: Boolean(row?.is_operational),
        in_maintenance: Boolean(row?.in_maintenance),
        in_accreditation: Boolean(row?.in_accreditation),
        in_breakdown: Boolean(row?.in_breakdown),
        include_in_daily_report: row?.include_in_daily_report !== false,
        entry_date: String(row?.entry_date || '').slice(0, 10) || null,
        return_date: String(row?.return_date || '').slice(0, 10) || null,
        lifecycle_periods: Array.isArray(row?.lifecycle_periods)
          ? row.lifecycle_periods
            .map((period: any) => ({
              entry_date: String(period?.entry_date || '').slice(0, 10),
              exit_date: String(period?.exit_date || '').slice(0, 10) || null,
            }))
            .filter((period: any) => period.entry_date)
          : [],
        mileage_km: row?.mileage_km === null || row?.mileage_km === undefined || String(row?.mileage_km).trim() === '' ? null : Number(row?.mileage_km || 0),
        notes: String(row?.notes || ''),
      };
    });
    normalizedRows.sort((a, b) => {
      const kindA = String(a.equipment_kind || '');
      const kindB = String(b.equipment_kind || '');
      if (kindA !== kindB) return kindA.localeCompare(kindB, 'es');
      const nameA = String(a.equipment_name || '').toUpperCase();
      const nameB = String(b.equipment_name || '').toUpperCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB, 'es');
      const patentA = String(a.patent || '').toUpperCase();
      const patentB = String(b.patent || '').toUpperCase();
      return patentA.localeCompare(patentB, 'es');
    });
    return normalizedRows;
  };
  const normalizeEquipmentDraftForCompare = (row: ManagementEquipmentRow | null) => {
    if (!row) return null;
    return {
      equipment_kind: row.equipment_kind === 'MENOR' ? 'MENOR' : 'MAYOR',
      equipment_name: String(row.equipment_name || '').trim().toLowerCase(),
      patent: String(row.patent || '').trim().toLowerCase(),
      quantity:
        row.quantity === null || row.quantity === undefined || String(row.quantity).trim() === ''
          ? 1
          : Number(row.quantity),
      canaletas_qty:
        row.canaletas_qty === null || row.canaletas_qty === undefined || String(row.canaletas_qty).trim() === ''
          ? 0
          : Number(row.canaletas_qty),
      piscinas_qty:
        row.piscinas_qty === null || row.piscinas_qty === undefined || String(row.piscinas_qty).trim() === ''
          ? 0
          : Number(row.piscinas_qty),
      is_operational: Boolean(row.is_operational),
      in_maintenance: Boolean(row.in_maintenance),
      in_accreditation: Boolean(row.in_accreditation),
      in_breakdown: Boolean(row.in_breakdown),
      entry_date: String(row.entry_date || '').slice(0, 10) || null,
      return_date: String(row.return_date || '').slice(0, 10) || null,
      mileage_km:
        row.mileage_km === null || row.mileage_km === undefined || String(row.mileage_km).trim() === ''
          ? null
          : Number(row.mileage_km),
      notes: String(row.notes || '').trim(),
    };
  };
  const equipmentModalHasChanges = useMemo(() => {
    if (equipmentModalMode !== 'edit') return true;
    const current = normalizeEquipmentDraftForCompare(equipmentDraft);
    const initial = normalizeEquipmentDraftForCompare(equipmentInitialDraft);
    if (!current || !initial) return false;
    return JSON.stringify(current) !== JSON.stringify(initial) ||
      String(equipmentEffectiveDate || '').slice(0, 10) !== String(equipmentDate || '').slice(0, 10);
  }, [equipmentModalMode, equipmentDraft, equipmentInitialDraft, equipmentEffectiveDate, equipmentDate]);
  const photoCoverPeriod = useMemo(() => {
    const startLabel = formatSpanishLongDate(photoPeriodStartDate);
    const endLabel = formatSpanishLongDate(photoPeriodEndDate);
    if (startLabel && endLabel) return `Periodo del ${startLabel} al ${endLabel}`;
    if (startLabel) return `Periodo desde ${startLabel}`;
    if (endLabel) return `Periodo hasta ${endLabel}`;
    return 'Periodo por definir';
  }, [photoPeriodStartDate, photoPeriodEndDate]);
  const photoPeriodInputLabel = useMemo(() => {
    const startLabel = formatSpanishShortDate(photoPeriodStartDate);
    const endLabel = formatSpanishShortDate(photoPeriodEndDate);
    if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
    return startLabel || endLabel || '';
  }, [photoPeriodStartDate, photoPeriodEndDate]);
  const hasPhotoPeriodSelected = Boolean(photoPeriodStartDate && photoPeriodEndDate);

  useEffect(() => {
    // Reuse same page background for both sectors by design.
    setPhotoPage3BackgroundUrl(DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL);
  }, []);

  const buildPhotoActivitySummary = React.useCallback((report: any, source?: any) => {
    const sourceObj = source && typeof source === 'object' ? source : null;
    const activity = String(
      sourceObj?.activity ||
      sourceObj?.activity_name ||
      sourceObj?.name ||
      sourceObj?.nombre ||
      ''
    ).trim();
    const description = String(
      sourceObj?.execution_description ||
      sourceObj?.executionDescription ||
      sourceObj?.description ||
      sourceObj?.descripcion ||
      sourceObj?.work_description ||
      ''
    ).trim();
    const quantity = String(
      sourceObj?.quantity ??
      sourceObj?.executed_quantity ??
      sourceObj?.quantity_executed ??
      ''
    ).trim();
    const unit = String(sourceObj?.unit || sourceObj?.unidad || '').trim();
    const pieces = [
      activity && description ? `${activity} - ${description}` : (activity || description),
      [quantity, unit].filter(Boolean).join(' '),
      String(sourceObj?.activity_front || sourceObj?.work_front || sourceObj?.front || report?.work_front || '').trim(),
      formatDate(String(report?.date || report?.report_date || '').slice(0, 10)),
      report?.report_sequence_no ? `N°${report.report_sequence_no}` : '',
    ].filter(Boolean);
    return pieces.join(' | ');
  }, []);

  const buildPhotoEvidence = React.useCallback((matcher: (front: string, report: any) => boolean) => {
    const start = photoPeriodStartDate || '';
    const end = photoPeriodEndDate || '';
    if (!hasPhotoPeriodSelected) return [];
    const out: PhotoEvidenceItem[] = [];
    const seen = new Set<string>();

    const pushEvidence = (frontRaw: string, report: any, files: Array<{ key: string; name: string }>, source?: any) => {
      const front = normalizeLabel(frontRaw || report?.work_front || report?.front || '');
      if (!matcher(front, report)) return;
      const crew = String(report?.crew_name || report?.crew_id || '-').trim() || '-';
      const reportId = String(report?.id || '').trim();
      const reportTitle = String(report?.report_title || '').trim();
      const date = String(report?.date || report?.report_date || '').slice(0, 10);
      const reportNo = String(report?.report_sequence_no || report?.report_no || '').trim();
      const sourceText = source && typeof source === 'object' ? JSON.stringify(source) : String(source || '');
      const activitySummary = buildPhotoActivitySummary(report, source);
      files.forEach((file) => {
        const key = String(file.key || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push({
          key,
          name: String(file.name || 'Imagen').trim(),
          front,
          date,
          reportNo,
          reportId,
          reportTitle,
          crew,
          activitySummary,
          searchText: [
            front,
            date,
            formatDate(date),
            reportNo,
            reportId,
            reportTitle,
            crew,
            report?.area,
            report?.specialty,
            sourceText,
          ].filter(Boolean).join(' '),
        });
      });
    };

    (reports || []).forEach((report: any) => {
      const reportDate = String(report?.date || report?.report_date || '').slice(0, 10);
      if (!reportDate) return;
      if (start && reportDate < start) return;
      if (end && reportDate > end) return;

      pushEvidence(String(report?.work_front || report?.front || ''), report, parseEvidenceFilesLite(report?.evidence_files || report?.evidence || report?.images || report?.photos));

      const activities = Array.isArray(parseJsonMaybe(report?.activities)) ? parseJsonMaybe(report?.activities) : [];
      activities.forEach((activity: any) => {
        const files = parseEvidenceFilesLite(activity?.evidence_files || activity?.evidence || activity?.images || activity?.photos);
        if (files.length === 0) return;
        pushEvidence(String(activity?.activity_front || activity?.work_front || activity?.front || report?.work_front || ''), report, files, activity);
      });

      const assignments = Array.isArray(parseJsonMaybe(report?.assignments)) ? parseJsonMaybe(report?.assignments) : [];
      assignments.forEach((activity: any) => {
        const files = parseEvidenceFilesLite(activity?.evidence_files || activity?.evidence || activity?.images || activity?.photos);
        if (files.length === 0) return;
        pushEvidence(String(activity?.activity_front || activity?.work_front || activity?.front || report?.work_front || ''), report, files, activity);
      });
    });

    return out.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const aNo = Number(a.reportNo || 0);
      const bNo = Number(b.reportNo || 0);
      if (aNo !== bNo) return aNo - bNo;
      if (a.crew !== b.crew) return a.crew.localeCompare(b.crew, 'es');
      return a.name.localeCompare(b.name, 'es');
    });
  }, [reports, photoPeriodStartDate, photoPeriodEndDate, hasPhotoPeriodSelected, buildPhotoActivitySummary]);

  const canaletasPhotoEvidence = useMemo<PhotoEvidenceItem[]>(() => {
    return buildPhotoEvidence((front) => front.includes('CANALET'));
  }, [buildPhotoEvidence]);

  const piscinasPhotoEvidence = useMemo<PhotoEvidenceItem[]>(() => {
    return buildPhotoEvidence((front) => front.includes('PISCIN'));
  }, [buildPhotoEvidence]);

  const adicionalesPhotoEvidence = useMemo<PhotoEvidenceItem[]>(() => {
    return buildPhotoEvidence((front, report) => {
      const title = normalizeLabel(String(report?.report_title || ''));
      return front.includes('USO DE RECURSOS') || title.includes('USO DE RECURSOS');
    });
  }, [buildPhotoEvidence]);

  const isPhotoEvidenceIncluded = React.useCallback((key: string) => {
    return Boolean(includedPhotoEvidenceKeys[String(key || '').trim()]);
  }, [includedPhotoEvidenceKeys]);

  const setPhotoEvidenceIncluded = React.useCallback((key: string, included: boolean) => {
    const normalized = String(key || '').trim();
    if (!normalized) return;
    setPhotoPreviewTransitionEnabled(false);
    setIncludedPhotoEvidenceKeys((prev) => {
      const next = { ...prev };
      if (included) next[normalized] = true;
      else delete next[normalized];
      return next;
    });
    setIncludedPhotoEvidenceOrder((prev) => {
      const withoutKey = prev.filter((itemKey) => itemKey !== normalized);
      return included ? [...withoutKey, normalized] : withoutKey;
    });
    setPhotoConfigDirty(true);
    setPhotoPreviewSlide((prev) => Math.max(0, prev));
    window.setTimeout(() => {
      setPhotoPreviewTransitionEnabled(true);
    }, 90);
  }, []);

  const selectablePhotoCandidates = useMemo(() => {
    const byKey = new Map<string, PhotoEvidenceItem>();
    [...canaletasPhotoEvidence, ...piscinasPhotoEvidence, ...adicionalesPhotoEvidence].forEach((item) => {
      const key = String(item.key || '').trim();
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, item);
    });
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.front !== b.front) return a.front.localeCompare(b.front, 'es');
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.name.localeCompare(b.name, 'es');
    });
  }, [canaletasPhotoEvidence, piscinasPhotoEvidence, adicionalesPhotoEvidence]);

  const restoreSelectedPhotoEvidence = React.useCallback(() => {
    const orderedKeys = photoRestoreSelectionOrder.filter((key) => photoRestoreSelection[key]);
    const unorderedKeys = Object.keys(photoRestoreSelection).filter((key) => photoRestoreSelection[key] && !orderedKeys.includes(key));
    const keys = [...orderedKeys, ...unorderedKeys];
    setPhotoPreviewTransitionEnabled(false);
    const next = keys.reduce<Record<string, true>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    setIncludedPhotoEvidenceKeys(next);
    setIncludedPhotoEvidenceOrder(keys);
    setPhotoConfigDirty(true);
    setPhotoRestoreDialogOpen(false);
    setPhotoRestoreSelection({});
    setPhotoRestoreSelectionOrder([]);
    window.setTimeout(() => setPhotoPreviewTransitionEnabled(true), 90);
  }, [photoRestoreSelection, photoRestoreSelectionOrder]);

  const photoKeywordQuery = useMemo(() => normalizeText(photoKeywordFilter), [photoKeywordFilter]);
  const getPhotoReportFilterValue = React.useCallback((item: PhotoEvidenceItem) => {
    const reportLabel = item.reportNo ? `N°${item.reportNo}` : (item.reportId || '-');
    const front = String(item.front || '').trim();
    const title = String(item.reportTitle || '').trim();
    return [reportLabel, front, title].filter(Boolean).join(' | ');
  }, []);
  const getPhotoActivityLabel = React.useCallback((item: PhotoEvidenceItem) => {
    const summary = String(item.activitySummary || '').trim();
    const primary = String(summary.split('|')[0] || item.reportTitle || 'Sin actividad').trim();
    return normalizeLabel(primary || 'Sin actividad');
  }, []);
  const getPhotoActivityFilterKey = React.useCallback((item: PhotoEvidenceItem) => {
    return `${normalizeText(item.front || 'Sin frente')}::${normalizeText(getPhotoActivityLabel(item))}`;
  }, [getPhotoActivityLabel]);
  const getPhotoActivityModules = React.useCallback((item: PhotoEvidenceItem) => {
    const label = getPhotoActivityLabel(item)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    const modules = Array.from(label.matchAll(
      /(?:\bMODULOS?\b|\bMOD\.)\s*(?:(?:N(?:RO|UMERO|O)?)[.\s]*(?:°|º|#)?\s*)?[:#.-]?\s*([0-9](?:(?:[0-9,\s/–—-]+)|(?:\b(?:Y|E|AL)\b))*)/gu
    ))
      .flatMap((match) => String(match[1] || '').match(/\d+/g) || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => `MÓDULO ${value}`);
    return Array.from(new Set(modules));
  }, [getPhotoActivityLabel]);
  const getPhotoSlideBucketKey = React.useCallback((item: PhotoEvidenceItem) => {
    const reportKey = normalizeText([
      item.date,
      item.reportNo,
      item.reportId || item.reportTitle || 'Sin reporte',
    ].filter(Boolean).join('|')) || 'sin-reporte';
    return `${reportKey}::${getPhotoActivityFilterKey(item)}`;
  }, [getPhotoActivityFilterKey]);
  const photoEvidenceMatchesKeyword = React.useCallback((item: PhotoEvidenceItem) => {
    if (!photoKeywordQuery) return true;
    const values = [
      item.name,
      item.front,
      item.date,
      formatDate(item.date),
      item.reportNo ? `N ${item.reportNo}` : '',
      item.reportNo ? `N°${item.reportNo}` : '',
      item.reportId,
      item.reportTitle,
      item.crew,
      item.activitySummary,
      item.searchText,
    ];
    const haystack = normalizeText(values.filter(Boolean).join(' '));
    return haystack.includes(photoKeywordQuery);
  }, [photoKeywordQuery]);
  const photoModuleBaseCandidates = useMemo(
    () => selectablePhotoCandidates.filter((item) => {
      if (!photoEvidenceMatchesKeyword(item)) return false;
      if (photoSelectFrontFilter && item.front !== photoSelectFrontFilter) return false;
      return true;
    }),
    [selectablePhotoCandidates, photoEvidenceMatchesKeyword, photoSelectFrontFilter]
  );
  const photoSelectModuleOptions = useMemo(
    () => {
      const modules = Array.from(new Set(photoModuleBaseCandidates.flatMap((item) => getPhotoActivityModules(item))))
        .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
      const hasActivitiesWithoutModule = photoModuleBaseCandidates.some((item) => getPhotoActivityModules(item).length === 0);
      return hasActivitiesWithoutModule ? [...modules, PHOTO_MODULE_OTHER] : modules;
    },
    [photoModuleBaseCandidates, getPhotoActivityModules]
  );
  const photoActivityBaseCandidates = useMemo(
    () => photoModuleBaseCandidates.filter((item) => {
      if (!photoSelectModuleFilter) return true;
      const modules = getPhotoActivityModules(item);
      if (photoSelectModuleFilter === PHOTO_MODULE_OTHER) return modules.length === 0;
      return modules.includes(photoSelectModuleFilter);
    }),
    [photoModuleBaseCandidates, photoSelectModuleFilter, getPhotoActivityModules]
  );
  const photoActivitySuggestions = useMemo<PhotoActivitySuggestion[]>(() => {
    const byActivity = new Map<string, {
      front: string;
      label: string;
      imageKeys: Set<string>;
      reports: Set<string>;
      crews: Set<string>;
    }>();

    photoActivityBaseCandidates.forEach((item) => {
      const key = getPhotoActivityFilterKey(item);
      const current = byActivity.get(key) || {
        front: item.front || 'Sin frente',
        label: getPhotoActivityLabel(item),
        imageKeys: new Set<string>(),
        reports: new Set<string>(),
        crews: new Set<string>(),
      };
      const imageKey = String(item.key || '').trim();
      if (imageKey) current.imageKeys.add(imageKey);
      const reportValue = getPhotoReportFilterValue(item);
      if (reportValue) current.reports.add(reportValue);
      if (item.crew) current.crews.add(item.crew);
      byActivity.set(key, current);
    });

    return Array.from(byActivity.entries()).map(([key, value]) => ({
      key,
      front: value.front,
      label: value.label,
      imageCount: value.imageKeys.size,
      reportCount: value.reports.size,
      crewCount: value.crews.size,
      selectedCount: Array.from(value.imageKeys).filter((imageKey) => photoRestoreSelection[imageKey]).length,
    })).sort((a, b) => {
      if (a.front !== b.front) return a.front.localeCompare(b.front, 'es');
      if (a.imageCount !== b.imageCount) return b.imageCount - a.imageCount;
      if (a.reportCount !== b.reportCount) return b.reportCount - a.reportCount;
      return a.label.localeCompare(b.label, 'es');
    });
  }, [photoActivityBaseCandidates, getPhotoActivityFilterKey, getPhotoActivityLabel, getPhotoReportFilterValue, photoRestoreSelection]);
  const photoActivitySuggestionSections = useMemo(() => {
    const byFront = new Map<string, PhotoActivitySuggestion[]>();
    photoActivitySuggestions.forEach((activity) => {
      const current = byFront.get(activity.front) || [];
      current.push(activity);
      byFront.set(activity.front, current);
    });
    return Array.from(byFront.entries()).map(([front, activities]) => ({
      front,
      groups: (() => {
        const visibleActivities = activities.slice(0, 8);
        const repeatedExactActivityGroups = visibleActivities
          .filter((activity) => activity.imageCount > 1)
          .map((activity) => ({
            label: `${activity.label} (coincidencias exactas)`,
            activities: [activity],
          }));
        const otherActivities = visibleActivities.filter((activity) => activity.imageCount <= 1);
        return [
          ...repeatedExactActivityGroups,
          otherActivities.length > 0
            ? { label: 'Otras actividades', activities: otherActivities }
            : null,
        ].filter(Boolean) as Array<{ label: string; activities: PhotoActivitySuggestion[] }>;
      })(),
    }));
  }, [photoActivitySuggestions]);
  const filteredSelectablePhotoCandidates = useMemo(
    () => photoActivityBaseCandidates.filter((item) => {
      if (photoSelectActivityFilter && getPhotoActivityFilterKey(item) !== photoSelectActivityFilter) return false;
      return true;
    }),
    [photoActivityBaseCandidates, photoSelectActivityFilter, getPhotoActivityFilterKey]
  );
  const filteredSelectedPhotoCount = useMemo(
    () => filteredSelectablePhotoCandidates.filter((item) => photoRestoreSelection[String(item.key || '').trim()]).length,
    [filteredSelectablePhotoCandidates, photoRestoreSelection]
  );
  const zoomPhotoCandidate = useMemo(
    () => selectablePhotoCandidates.find((item) => String(item.key || '').trim() === photoZoomEvidenceKey) || null,
    [selectablePhotoCandidates, photoZoomEvidenceKey]
  );
  const zoomPhotoReportBadgeColors = useMemo(
    () => zoomPhotoCandidate ? getPhotoReportBadgeColors(zoomPhotoCandidate) : null,
    [zoomPhotoCandidate]
  );
  const zoomPhotoList = useMemo(
    () => filteredSelectablePhotoCandidates.length > 0 ? filteredSelectablePhotoCandidates : selectablePhotoCandidates,
    [filteredSelectablePhotoCandidates, selectablePhotoCandidates]
  );
  const zoomPhotoIndex = useMemo(
    () => zoomPhotoList.findIndex((item) => String(item.key || '').trim() === photoZoomEvidenceKey),
    [zoomPhotoList, photoZoomEvidenceKey]
  );
  const goToZoomPhoto = React.useCallback((direction: -1 | 1) => {
    if (zoomPhotoList.length === 0) return;
    const currentIndex = zoomPhotoIndex >= 0 ? zoomPhotoIndex : 0;
    const nextIndex = (currentIndex + direction + zoomPhotoList.length) % zoomPhotoList.length;
    const nextKey = String(zoomPhotoList[nextIndex]?.key || '').trim();
    if (nextKey) setPhotoZoomEvidenceKey(nextKey);
  }, [zoomPhotoIndex, zoomPhotoList]);
  const photoSelectFrontOptions = useMemo(
    () => Array.from(new Set(selectablePhotoCandidates.map((item) => item.front).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [selectablePhotoCandidates]
  );
  useEffect(() => {
    if (photoSelectModuleFilter && !photoSelectModuleOptions.includes(photoSelectModuleFilter)) {
      setPhotoSelectModuleFilter('');
      setPhotoSelectActivityFilter('');
    }
  }, [photoSelectModuleFilter, photoSelectModuleOptions]);
  useEffect(() => {
    if (photoSelectActivityFilter && !photoActivitySuggestions.some((activity) => activity.key === photoSelectActivityFilter)) {
      setPhotoSelectActivityFilter('');
    }
  }, [photoSelectActivityFilter, photoActivitySuggestions]);

  const visibleCanaletasPhotoEvidence = useMemo<PhotoEvidenceItem[]>(
    () => canaletasPhotoEvidence.filter((item) => isPhotoEvidenceIncluded(item.key) && photoEvidenceMatchesKeyword(item)),
    [canaletasPhotoEvidence, isPhotoEvidenceIncluded, photoEvidenceMatchesKeyword]
  );
  const visiblePiscinasPhotoEvidence = useMemo<PhotoEvidenceItem[]>(
    () => piscinasPhotoEvidence.filter((item) => isPhotoEvidenceIncluded(item.key) && photoEvidenceMatchesKeyword(item)),
    [piscinasPhotoEvidence, isPhotoEvidenceIncluded, photoEvidenceMatchesKeyword]
  );
  const visibleAdicionalesPhotoEvidence = useMemo<PhotoEvidenceItem[]>(
    () => adicionalesPhotoEvidence.filter((item) => isPhotoEvidenceIncluded(item.key) && photoEvidenceMatchesKeyword(item)),
    [adicionalesPhotoEvidence, isPhotoEvidenceIncluded, photoEvidenceMatchesKeyword]
  );
  const totalPhotoEvidenceCount = canaletasPhotoEvidence.length + piscinasPhotoEvidence.length + adicionalesPhotoEvidence.length;
  const visiblePhotoEvidenceCount = visibleCanaletasPhotoEvidence.length + visiblePiscinasPhotoEvidence.length + visibleAdicionalesPhotoEvidence.length;
  const getPhotoGroupTitle = React.useCallback((group: PhotoSlideGroup | null | undefined) => {
    if (!group) return '';
    return normalizePhotoSlideTitle(photoSlideTitleOverrides[group.key] ?? group.defaultTitle ?? '');
  }, [photoSlideTitleOverrides]);

  const getPhotoGroupDefaultTitle = React.useCallback((items: PhotoSlideItem[], fallbackTitle: string) => {
    const activityLabels = Array.from(new Set(
      (items || [])
        .map((item) => String(item?.evidence?.activitySummary || '').split('|')[0]?.trim())
        .filter(Boolean)
    ));
    if (activityLabels.length > 0) return normalizePhotoSlideTitle(activityLabels.join(' / '));
    return normalizePhotoSlideTitle(fallbackTitle);
  }, []);

  const buildPhotoGroups = React.useCallback((photoEvidence: PhotoEvidenceItem[], defaultTitle: string) => {
    const groups: PhotoSlideGroup[] = [];
    const RATIO_VERY_WIDE = 2.2;
    const selectionOrder = new Map(
      includedPhotoEvidenceOrder.map((key, index) => [String(key || '').trim(), index])
    );

    const compareEvidenceForSlides = (a: PhotoEvidenceItem, b: PhotoEvidenceItem) => {
      const aKey = String(a.key || '').trim();
      const bKey = String(b.key || '').trim();
      const aOrder = selectionOrder.has(aKey) ? Number(selectionOrder.get(aKey)) : Number.POSITIVE_INFINITY;
      const bOrder = selectionOrder.has(bKey) ? Number(selectionOrder.get(bKey)) : Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const aNo = Number(a.reportNo || 0);
      const bNo = Number(b.reportNo || 0);
      if (aNo !== bNo) return aNo - bNo;
      if (a.crew !== b.crew) return a.crew.localeCompare(b.crew, 'es');
      const aActivity = getPhotoActivityLabel(a);
      const bActivity = getPhotoActivityLabel(b);
      if (aActivity !== bActivity) return aActivity.localeCompare(bActivity, 'es');
      return a.name.localeCompare(b.name, 'es');
    };

    const byFront = new Map<string, Map<string, PhotoEvidenceItem[]>>();
    photoEvidence.forEach((item) => {
      const front = String(item.front || defaultTitle || 'SIN FRENTE').trim() || 'SIN FRENTE';
      const frontBuckets = byFront.get(front) || new Map<string, PhotoEvidenceItem[]>();
      const bucketKey = getPhotoSlideBucketKey(item);
      const current = frontBuckets.get(bucketKey) || [];
      current.push(item);
      frontBuckets.set(bucketKey, current);
      byFront.set(front, frontBuckets);
    });
    const frontKeys = Array.from(byFront.keys()).sort((a, b) => a.localeCompare(b, 'es'));
    for (const front of frontKeys) {
      const bucketEntries = Array.from((byFront.get(front) || new Map<string, PhotoEvidenceItem[]>()).entries())
        .map(([bucketKey, evidenceItems]) => ({
          bucketKey,
          evidenceItems: evidenceItems.slice().sort(compareEvidenceForSlides),
        }))
        .sort((a, b) => compareEvidenceForSlides(a.evidenceItems[0], b.evidenceItems[0]));

      for (const bucket of bucketEntries) {
        const slideItems: PhotoSlideItem[] = bucket.evidenceItems.map((evidence: PhotoEvidenceItem) => {
          const ratio = Number(photoEvidenceRatioByKey[evidence.key] || 1);
          return {
            evidence,
            ratio,
            isNarrow: false,
            isVeryWide: ratio > RATIO_VERY_WIDE,
          };
        });
        for (let i = 0; i < slideItems.length;) {
          const chunk = slideItems.slice(i, i + 2);
          const layout: 'one' | 'two' = chunk.length === 1 ? 'one' : 'two';
          groups.push({
            key: `${normalizeText(defaultTitle) || 'sector'}:${normalizeText(front) || 'front'}:${bucket.bucketKey}:${chunk.map((it) => String(it.evidence.key || '')).join('|')}`,
            crew: Array.from(new Set(chunk.map((it) => it.evidence.crew).filter(Boolean))).join(' / ') || '-',
            layout,
            defaultTitle: getPhotoGroupDefaultTitle(chunk, defaultTitle),
            items: chunk,
          });
          i += 2;
        }
      }
    }
    return groups;
  }, [getPhotoActivityLabel, getPhotoGroupDefaultTitle, getPhotoSlideBucketKey, includedPhotoEvidenceOrder, photoEvidenceRatioByKey]);

  const canaletasPhotoGroups = useMemo<PhotoSlideGroup[]>(() => {
    return buildPhotoGroups(visibleCanaletasPhotoEvidence, photoPage3AreaTitle || 'ÁREA CANALETAS');
  }, [buildPhotoGroups, visibleCanaletasPhotoEvidence, photoPage3AreaTitle]);

  const piscinasPhotoGroups = useMemo<PhotoSlideGroup[]>(() => {
    return buildPhotoGroups(visiblePiscinasPhotoEvidence, photoPiscinasAreaTitle || 'ÁREA PISCINAS');
  }, [buildPhotoGroups, visiblePiscinasPhotoEvidence, photoPiscinasAreaTitle]);

  const adicionalesPhotoGroups = useMemo<PhotoSlideGroup[]>(() => {
    return buildPhotoGroups(visibleAdicionalesPhotoEvidence, photoAdicionalesAreaTitle || 'ADICIONALES');
  }, [buildPhotoGroups, visibleAdicionalesPhotoEvidence, photoAdicionalesAreaTitle]);

  const totalPhotoSlides = hasPhotoPeriodSelected
    ? 6 + canaletasPhotoGroups.length + piscinasPhotoGroups.length + adicionalesPhotoGroups.length
    : 1;
  const photoPersistenceKey = useMemo(() => {
    return `photo-report-config:${photoCoverReportNo || '000'}:${photoPeriodStartDate || '-'}:${photoPeriodEndDate || '-'}`;
  }, [photoCoverReportNo, photoPeriodStartDate, photoPeriodEndDate]);
  const sectorPageRanges = useMemo(() => {
    const canaletasTitle = 3;
    const canaletasEnd = canaletasTitle + canaletasPhotoGroups.length;
    const piscinasTitle = canaletasEnd + 1;
    const piscinasEnd = piscinasTitle + piscinasPhotoGroups.length;
    const adicionalesTitle = piscinasEnd + 1;
    const adicionalesEnd = adicionalesTitle + adicionalesPhotoGroups.length;
    const contraportada = adicionalesEnd + 1;
    return [
      { key: 'cover', label: 'PORTADA', start: 1, end: 2 },
      { key: 'can', label: 'CANALETAS', start: canaletasTitle, end: canaletasEnd },
      { key: 'pis', label: 'PISCINAS', start: piscinasTitle, end: piscinasEnd },
      { key: 'adi', label: 'ADICIONALES', start: adicionalesTitle, end: adicionalesEnd },
      { key: 'back', label: 'CONTRAPORTADA', start: contraportada, end: contraportada },
    ];
  }, [canaletasPhotoGroups.length, piscinasPhotoGroups.length, adicionalesPhotoGroups.length]);
  const currentPreviewPage = photoPreviewSlide + 1;
  const activeSectorIndex = useMemo(
    () => sectorPageRanges.findIndex((s) => currentPreviewPage >= s.start && currentPreviewPage <= s.end),
    [sectorPageRanges, currentPreviewPage]
  );
  const goToSector = React.useCallback((sectorIdx: number) => {
    const target = sectorPageRanges[sectorIdx];
    if (!target) return;
    setPhotoPreviewSlide(Math.max(0, target.start - 1));
  }, [sectorPageRanges]);
  const activePhotoSectionKey = String(sectorPageRanges[activeSectorIndex]?.key || '');
  const activePhotoSectionTitleValue =
    activePhotoSectionKey === 'pis'
      ? photoPiscinasAreaTitle
      : activePhotoSectionKey === 'adi'
        ? photoAdicionalesAreaTitle
        : photoPage3AreaTitle;
  const setActivePhotoSectionTitle = React.useCallback((value: string) => {
    if (activePhotoSectionKey === 'pis') {
      setPhotoPiscinasAreaTitle(value);
      return;
    }
    if (activePhotoSectionKey === 'adi') {
      setPhotoAdicionalesAreaTitle(value);
      return;
    }
    setPhotoPage3AreaTitle(value);
  }, [activePhotoSectionKey]);
  const canExportPhotoReport = hasPhotoPeriodSelected && photoConfigExistsForScope && !photoConfigDirty && !photoConfigSaving;
  const savePhotoReportConfig = React.useCallback(async () => {
    if (!photoPeriodStartDate || !photoPeriodEndDate) return;
    try {
      setPhotoConfigSaving(true);
      const res = await fetch('/api/management/photo-report-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_no: String(photoCoverReportNo || '000'),
          period_start: String(photoPeriodStartDate || ''),
          period_end: String(photoPeriodEndDate || ''),
          hidden_image_keys: {
            __mode: 'include',
            __included: includedPhotoEvidenceKeys,
            __included_order: includedPhotoEvidenceOrder,
            __title_overrides: photoSlideTitleOverrides,
            __section_titles: {
              canaletas: photoPage3AreaTitle,
              piscinas: photoPiscinasAreaTitle,
              adicionales: photoAdicionalesAreaTitle,
            },
          },
          export_range_start: 1,
          export_range_end: Math.max(1, totalPhotoSlides),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
      setPhotoConfigDirty(false);
      setPhotoConfigExistsForScope(true);
      setNotice({ message: 'Configuración guardada.', severity: 'success' });
      clearPhotoReportConfigCache();
      const listJson = await fetchPhotoReportConfig();
      const list = Array.isArray(listJson?.configs) ? listJson.configs : [];
      setSavedPhotoConfigs(list);
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo guardar la configuración.', severity: 'error' });
    } finally {
      setPhotoConfigSaving(false);
    }
  }, [photoCoverReportNo, photoPeriodStartDate, photoPeriodEndDate, includedPhotoEvidenceKeys, includedPhotoEvidenceOrder, photoSlideTitleOverrides, photoPage3AreaTitle, photoPiscinasAreaTitle, photoAdicionalesAreaTitle, totalPhotoSlides, setNotice]);
  const activePhotoEvidenceGroup = useMemo<{ areaTitle: string; group: PhotoSlideGroup } | null>(() => {
    if (photoPreviewSlide < 3) return null;
    const canaletasStart = 3;
    const canaletasEnd = canaletasStart + canaletasPhotoGroups.length;
    if (photoPreviewSlide >= canaletasStart && photoPreviewSlide < canaletasEnd) {
      return { areaTitle: photoPage3AreaTitle || 'ÁREA CANALETAS', group: canaletasPhotoGroups[photoPreviewSlide - canaletasStart] };
    }
    const piscinasTitleSlide = canaletasEnd;
    const piscinasStart = piscinasTitleSlide + 1;
    const piscinasEnd = piscinasStart + piscinasPhotoGroups.length;
    if (photoPreviewSlide >= piscinasStart && photoPreviewSlide < piscinasEnd) {
      return { areaTitle: photoPiscinasAreaTitle || 'ÁREA PISCINAS', group: piscinasPhotoGroups[photoPreviewSlide - piscinasStart] };
    }
    const adicionalesTitleSlide = piscinasEnd;
    const adicionalesStart = adicionalesTitleSlide + 1;
    const adicionalesEnd = adicionalesStart + adicionalesPhotoGroups.length;
    if (photoPreviewSlide >= adicionalesStart && photoPreviewSlide < adicionalesEnd) {
      return { areaTitle: photoAdicionalesAreaTitle || 'ADICIONALES', group: adicionalesPhotoGroups[photoPreviewSlide - adicionalesStart] };
    }
    return null;
  }, [photoPreviewSlide, canaletasPhotoGroups, piscinasPhotoGroups, adicionalesPhotoGroups, photoPage3AreaTitle, photoPiscinasAreaTitle, photoAdicionalesAreaTitle]);
  const activePhotoEvidenceSummary = useMemo(() => {
    if (!activePhotoEvidenceGroup) return '';
    const crews = Array.from(new Set([activePhotoEvidenceGroup.group.crew].filter(Boolean)));
    const dates = Array.from(new Set(activePhotoEvidenceGroup.group.items.map((it) => formatDate(it.evidence.date)).filter(Boolean)));
    const fronts = Array.from(new Set(activePhotoEvidenceGroup.group.items.map((it) => it.evidence.front).filter(Boolean)));
    const reports = Array.from(new Set(activePhotoEvidenceGroup.group.items.map((it) => {
      const no = it.evidence.reportNo ? `N°${it.evidence.reportNo}` : '';
      const title = String(it.evidence.reportTitle || '').trim();
      const reportRef = title || (it.evidence.reportId ? `ID ${it.evidence.reportId}` : '');
      return [no, reportRef].filter(Boolean).join(' - ');
    }).filter(Boolean)));
    return `Origen: ${activePhotoEvidenceGroup.areaTitle} | Cuadrilla ${crews.join(' | ') || '-'} | Fecha ${dates.join(' | ') || '-'} | Frente ${fronts.join(' | ') || '-'} | Reporte ${reports.join(' | ') || '-'}`;
  }, [activePhotoEvidenceGroup]);

  const RangeDay = (props: PickersDayProps) => {
    const { day, ...other } = props;
    const isStart = isSameDate(day, photoTempStartDate);
    const isEnd = isSameDate(day, photoTempEndDate);
    const inRange = Boolean(
      photoTempStartDate &&
      photoTempEndDate &&
      day > photoTempStartDate &&
      day < photoTempEndDate
    );

    return (
      <PickersDay
        {...other}
        day={day}
        selected={isStart || isEnd}
        sx={{
          ...(inRange
            ? {
                backgroundColor: alpha(colors.managementCalendarBlue, 0.14),
                borderRadius: 0,
                '&:hover, &:focus': { backgroundColor: alpha(colors.managementCalendarBlue, 0.2) },
              }
            : {}),
          ...(isStart
            ? {
                borderTopLeftRadius: 20,
                borderBottomLeftRadius: 20,
              }
            : {}),
          ...(isEnd
            ? {
                borderTopRightRadius: 20,
                borderBottomRightRadius: 20,
              }
            : {}),
        }}
      />
    );
  };

  const HhMatrixRangeDay = (props: PickersDayProps) => {
    const { day, ...other } = props;
    const isStart = isSameDate(day, hhMatrixTempStartDate);
    const isEnd = isSameDate(day, hhMatrixTempEndDate);
    const inRange = Boolean(
      hhMatrixTempStartDate &&
      hhMatrixTempEndDate &&
      day > hhMatrixTempStartDate &&
      day < hhMatrixTempEndDate
    );

    return (
      <PickersDay
        {...other}
        day={day}
        selected={isStart || isEnd}
        sx={{
          ...(inRange
            ? {
                backgroundColor: alpha(colors.managementCalendarBlue, 0.14),
                borderRadius: 0,
                '&:hover, &:focus': { backgroundColor: alpha(colors.managementCalendarBlue, 0.2) },
              }
            : {}),
          ...(isStart
            ? {
                borderTopLeftRadius: 20,
                borderBottomLeftRadius: 20,
              }
            : {}),
          ...(isEnd
            ? {
                borderTopRightRadius: 20,
                borderBottomRightRadius: 20,
              }
            : {}),
        }}
      />
    );
  };

  const exportPhotoReportPptx = React.useCallback(async () => {
    const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo convertir imagen para PPTX.'));
      reader.readAsDataURL(blob);
    });

    const normalizeImageBlobForPptx = async (blob: Blob) => {
      const rawType = String(blob.type || '').toLowerCase();
      if (rawType.includes('png') || rawType.includes('jpeg') || rawType.includes('jpg')) {
        return blob;
      }
      const rawData = await blobToDataUrl(blob);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('No se pudo cargar imagen para normalizar PPTX.'));
        image.src = rawData;
      });
      const width = Math.max(1, img.naturalWidth || img.width || 1);
      const height = Math.max(1, img.naturalHeight || img.height || 1);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.drawImage(img, 0, 0, width, height);
      const normalizedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return normalizedBlob || blob;
    };

    const toDataUrl = async (url: string, options?: { normalizeForPptx?: boolean }) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No se pudo cargar imagen: ${url}`);
      const rawBlob = await response.blob();
      const blob = options?.normalizeForPptx ? await normalizeImageBlobForPptx(rawBlob) : rawBlob;
      return await blobToDataUrl(blob);
    };

    const getImageDimensionsForPptx = async (data: string) => {
      return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({
          width: Math.max(1, image.naturalWidth || image.width || 1),
          height: Math.max(1, image.naturalHeight || image.height || 1),
        });
        image.onerror = () => reject(new Error('No se pudo leer dimensiones de imagen para PPTX.'));
        image.src = data;
      });
    };

    const addNativeCroppedImage = async (slide: any, data: string, slot: { x: number; y: number; w: number; h: number }) => {
      const dims = await getImageDimensionsForPptx(data);
      const imageRatio = dims.width / dims.height;
      const slotRatio = Number(slot.w || 1) / Math.max(0.01, Number(slot.h || 1));
      let scaledW = Number(slot.w || 1);
      let scaledH = Number(slot.h || 1);
      if (imageRatio > slotRatio) {
        scaledH = Number(slot.h || 1);
        scaledW = scaledH * imageRatio;
      } else {
        scaledW = Number(slot.w || 1);
        scaledH = scaledW / imageRatio;
      }
      const cropX = Math.max(0, (scaledW - Number(slot.w || 1)) / 2);
      const cropY = Math.max(0, (scaledH - Number(slot.h || 1)) / 2);
      slide.addImage({
        data,
        x: slot.x,
        y: slot.y,
        w: scaledW,
        h: scaledH,
        sizing: {
          type: 'crop',
          x: cropX,
          y: cropY,
          w: slot.w,
          h: slot.h,
        },
      });
    };

    try {
      setPhotoExporting(true);
      const total = Math.max(1, totalPhotoSlides);
      const rangeStartInput = String(photoExportRangeStart || '').trim();
      const rangeEndInput = String(photoExportRangeEnd || '').trim();
      const rangeStart = Math.max(1, Math.min(total, Math.trunc(Number(rangeStartInput || 1) || 1)));
      const rangeEndRaw = Math.max(1, Math.min(total, Math.trunc(Number(rangeEndInput || total) || total)));
      const rangeEnd = Math.max(rangeStart, rangeEndRaw);
      let pageCursor = 0;
      const includeNextPage = () => {
        pageCursor += 1;
        return pageCursor >= rangeStart && pageCursor <= rangeEnd;
      };
      const PptxGenJS = window?.PptxGenJS;
      if (!PptxGenJS) {
        throw new Error('No se pudo cargar el motor de exportación PPTX.');
      }
      const [coverBg, coverLogo, page2Bg, page3Bg, finalCompanyLogo] = await Promise.all([
        toDataUrl(DEFAULT_PHOTO_REPORT_BACKGROUND_URL),
        toDataUrl(photoCoverLogoUrl || DEFAULT_PHOTO_REPORT_LOGO_URL),
        toDataUrl(photoPage2BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE2_BACKGROUND_URL),
        toDataUrl(photoPage3BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL),
        toDataUrl(DEFAULT_PHOTO_REPORT_FINAL_COMPANY_LOGO_URL),
      ]);

      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
      pptx.author = 'IngenIT';
      pptx.company = 'IngenIT';
      pptx.subject = 'Informe Fotografico';
      pptx.title = 'Informe Fotografico Semanal';
      const setLockedSlideBackground = (slide: any, data: string) => {
        slide.background = { data };
      };

      if (includeNextPage()) {
      const slide1 = pptx.addSlide();
      setLockedSlideBackground(slide1, coverBg);
      slide1.addText(photoCoverTitle || 'Titulo de informe fotografico', {
        x: 1.2,
        y: 0.55,
        w: 10.9,
        h: 0.95,
        align: 'center',
        valign: 'middle',
        color: 'FFFFFF',
        fontSize: 26,
        bold: false,
      });
      slide1.addImage({ data: coverLogo, x: 5.5, y: 2.45, w: 2.35, h: 2.35, sizing: { type: 'contain', x: 5.5, y: 2.45, w: 2.35, h: 2.35 } });
      slide1.addShape(pptx.ShapeType.line, {
        x: 3.6,
        y: 4.95,
        w: 6.1,
        h: 0,
        line: { color: 'FFFFFF', pt: 1.5 },
      });
      slide1.addText('PRESENTACION FOTOGRAFICA', {
        x: 3.2,
        y: 5.12,
        w: 6.9,
        h: 0.45,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 23,
      });
      slide1.addText(`Informe N°${photoCoverReportNo || '000'}`, {
        x: 3.2,
        y: 5.55,
        w: 6.9,
        h: 0.5,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 29,
      });
      slide1.addText(photoCoverPeriod || 'Periodo por definir', {
        x: 1.5,
        y: 6.72,
        w: 10.3,
        h: 0.45,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 24,
      });
      }

      if (includeNextPage()) {
      const slide2 = pptx.addSlide();
      setLockedSlideBackground(slide2, page2Bg);
      slide2.addText('REGISTRO FOTOGRAFICO SEMANAL', {
        x: 6.35,
        y: 3.72,
        w: 6.85,
        h: 0.62,
        align: 'right',
        color: 'FFFFFF',
        fontSize: 31,
        bold: true,
      });
      }

      if (includeNextPage()) {
      const slide3 = pptx.addSlide();
      setLockedSlideBackground(slide3, page3Bg);
      slide3.addText(photoPage3AreaTitle || 'ÁREA CANALETAS', {
        x: 3.2,
        y: 2.95,
        w: 6.9,
        h: 1.25,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 44,
        bold: true,
      });
      }

      const sanitizeGroupsForExport = (groups: PhotoSlideGroup[]) =>
        groups
          .map((group) => ({
            ...group,
            items: (group.items || []).filter((it) => includedPhotoEvidenceKeys[String(it?.evidence?.key || '').trim()]),
          }))
          .filter((group) => group.items.length > 0);

      const exportCanaletasGroups = sanitizeGroupsForExport(canaletasPhotoGroups);
      const exportPiscinasGroups = sanitizeGroupsForExport(piscinasPhotoGroups);
      const exportAdicionalesGroups = sanitizeGroupsForExport(adicionalesPhotoGroups);
      const addPhotoGroupImagesToSlide = async (slide: any, group: PhotoSlideGroup) => {
        const slotByLayout = group.layout === 'one'
          ? [{ x: 1.65, y: 1.42, w: 10.05, h: 5.78 }]
          : group.layout === 'three'
            ? [
                { x: 0.38, y: 1.78, w: 4.06, h: 5.38 },
                { x: 4.64, y: 1.78, w: 4.06, h: 5.38 },
                { x: 8.9, y: 1.78, w: 4.06, h: 5.38 },
              ]
            : [
                { x: 0.38, y: 1.78, w: 6.25, h: 5.38 },
                { x: 6.7, y: 1.78, w: 6.25, h: 5.38 },
              ];
        for (let idx = 0; idx < slotByLayout.length; idx += 1) {
          const item = group.items[idx] || null;
          if (!item) continue;
          const data = await toDataUrl(
            `/api/field-reports/evidence/download?key=${encodeURIComponent(item.evidence.key)}&name=${encodeURIComponent(item.evidence.name || 'imagen')}`,
            { normalizeForPptx: true }
          );
          await addNativeCroppedImage(slide, data, slotByLayout[idx]);
        }
      };

      for (const group of exportCanaletasGroups) {
        if (!includeNextPage()) continue;
        if (!group?.items || group.items.length === 0) continue;
        const slide = pptx.addSlide();
        setLockedSlideBackground(slide, page3Bg);
        slide.addText('"Contratos de Construcción GRPO 2025_2026"', {
          x: 6.2,
          y: 0.18,
          w: 6.9,
          h: 0.52,
          align: 'right',
          color: 'FFFFFF',
          fontSize: 20,
          bold: true,
        });
        slide.addText(getPhotoGroupTitle(group) || photoPage3AreaTitle || 'ÁREA CANALETAS', {
          x: 2.75,
          y: 0.74,
          w: 10.35,
          h: 0.34,
          align: 'right',
          color: 'FFFFFF',
          fontSize: 16,
          bold: true,
        });

        await addPhotoGroupImagesToSlide(slide, group);
      }

      if (includeNextPage()) {
      const slidePiscinasTitle = pptx.addSlide();
      setLockedSlideBackground(slidePiscinasTitle, page3Bg);
      slidePiscinasTitle.addText(photoPiscinasAreaTitle || 'ÁREA PISCINAS', {
        x: 3.2,
        y: 2.95,
        w: 6.9,
        h: 1.25,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 44,
        bold: true,
      });
      }

      for (const group of exportPiscinasGroups) {
        if (!includeNextPage()) continue;
        if (!group?.items || group.items.length === 0) continue;
        const slide = pptx.addSlide();
        setLockedSlideBackground(slide, page3Bg);
        slide.addText('"Contratos de Construcción GRPO 2025_2026"', {
          x: 6.2,
          y: 0.18,
          w: 6.9,
          h: 0.52,
          align: 'right',
          color: 'FFFFFF',
          fontSize: 20,
          bold: true,
        });
        slide.addText(getPhotoGroupTitle(group) || photoPiscinasAreaTitle || 'ÁREA PISCINAS', {
          x: 2.75,
          y: 0.74,
          w: 10.35,
          h: 0.34,
          align: 'right',
          color: 'FFFFFF',
          fontSize: 16,
          bold: true,
        });

        await addPhotoGroupImagesToSlide(slide, group);
      }

      if (includeNextPage()) {
      const slideAdicionalesTitle = pptx.addSlide();
      setLockedSlideBackground(slideAdicionalesTitle, page3Bg);
      slideAdicionalesTitle.addText(photoAdicionalesAreaTitle || 'ADICIONALES', {
        x: 3.2,
        y: 2.7,
        w: 6.9,
        h: 0.9,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 44,
        bold: true,
      });
      }
      for (const group of exportAdicionalesGroups) {
        if (!includeNextPage()) continue;
        if (!group?.items || group.items.length === 0) continue;
        const slide = pptx.addSlide();
        setLockedSlideBackground(slide, page3Bg);
        slide.addText('"Contratos de Construcción GRPO 2025_2026"', {
          x: 6.2,
          y: 0.18,
          w: 6.9,
          h: 0.52,
          align: 'right',
          color: 'FFFFFF',
          fontSize: 20,
          bold: true,
        });
        slide.addText(getPhotoGroupTitle(group) || photoAdicionalesAreaTitle || 'ADICIONALES', {
          x: 2.75,
          y: 0.74,
          w: 10.35,
          h: 0.34,
          align: 'right',
          color: 'FFFFFF',
          fontSize: 16,
          bold: true,
        });

        await addPhotoGroupImagesToSlide(slide, group);
      }

      if (includeNextPage()) {
      const slideFinal = pptx.addSlide();
      setLockedSlideBackground(slideFinal, coverBg);
      slideFinal.addImage({ data: coverLogo, x: 5.55, y: 2.65, w: 2.2, h: 2.2, sizing: { type: 'contain', x: 5.55, y: 2.65, w: 2.2, h: 2.2 } });
      slideFinal.addShape(pptx.ShapeType.line, {
        x: 1.3,
        y: 5.72,
        w: 10.7,
        h: 0,
        line: { color: 'FFFFFF', pt: 1.5 },
      });
      slideFinal.addText('Badajoz 45, Piso 5 - Edificio los fundadores. Las Condes', {
        x: 1.0,
        y: 5.97,
        w: 11.3,
        h: 0.35,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 16,
      });
      slideFinal.addText('www.pugamujica.cl', {
        x: 1.0,
        y: 6.32,
        w: 11.3,
        h: 0.35,
        align: 'center',
        color: 'FFFFFF',
        fontSize: 20,
        bold: true,
      });
      slideFinal.addImage({
        data: finalCompanyLogo,
        x: 4.95,
        y: 6.86,
        w: 0.28,
        h: 0.28,
        sizing: { type: 'contain', x: 4.95, y: 6.86, w: 0.28, h: 0.28 },
      });
      slideFinal.addText('Puga, Mujica Asociados S.A.', {
        x: 5.29,
        y: 6.84,
        w: 4.7,
        h: 0.35,
        align: 'left',
        color: 'FFFFFF',
        fontSize: 18,
      });
      }

      const today = new Date();
      const yy = String(today.getFullYear());
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      await pptx.writeFile({ fileName: `informe_fotografico_${yy}${mm}${dd}.pptx` });
      setNotice({ message: 'PPTX exportado correctamente.', severity: 'success' });
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo exportar el PPTX.', severity: 'error' });
    } finally {
      setPhotoExporting(false);
    }
  }, [photoCoverLogoUrl, photoPage2BackgroundUrl, photoPage3BackgroundUrl, photoPage3AreaTitle, photoPiscinasAreaTitle, photoAdicionalesAreaTitle, photoCoverTitle, photoCoverReportNo, photoCoverPeriod, canaletasPhotoGroups, piscinasPhotoGroups, adicionalesPhotoGroups, includedPhotoEvidenceKeys, photoExportRangeStart, photoExportRangeEnd, totalPhotoSlides, getPhotoGroupTitle, setNotice]);

  useEffect(() => {
    let cancelled = false;
    const visibleKeys = (activePhotoEvidenceGroup?.group?.items || [])
      .map((item) => String(item?.evidence?.key || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    const missing = visibleKeys.filter((key) => !photoEvidencePreviewByKey[key]);
    if (missing.length === 0) return;

    const load = async () => {
      const updates: Record<string, string> = {};
      await Promise.all(missing.map(async (key) => {
        try {
          const res = await fetch(`/api/field-reports/evidence/view?key=${encodeURIComponent(key)}`);
          if (!res.ok) return;
          const json = await res.json().catch(() => null);
          const url = String(json?.url || '').trim();
          if (url) updates[key] = url;
        } catch {}
      }));
      if (cancelled) return;
      if (Object.keys(updates).length > 0) {
        setPhotoEvidencePreviewByKey((prev) => ({ ...prev, ...updates }));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activePhotoEvidenceGroup, photoEvidencePreviewByKey]);

  useEffect(() => {
    if (!photoRestoreDialogOpen) return;
    let cancelled = false;
    const visibleKeys = filteredSelectablePhotoCandidates
      .map((item) => String(item?.key || '').trim())
      .filter(Boolean)
      .slice(0, 120);
    const missing = visibleKeys.filter((key) => !photoEvidencePreviewByKey[key]);
    if (missing.length === 0) return;

    const load = async () => {
      const updates: Record<string, string> = {};
      await Promise.all(missing.map(async (key) => {
        try {
          const res = await fetch(`/api/field-reports/evidence/view?key=${encodeURIComponent(key)}`);
          if (!res.ok) return;
          const json = await res.json().catch(() => null);
          const url = String(json?.url || '').trim();
          if (url) updates[key] = url;
        } catch {}
      }));
      if (cancelled) return;
      if (Object.keys(updates).length > 0) {
        setPhotoEvidencePreviewByKey((prev) => ({ ...prev, ...updates }));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [photoRestoreDialogOpen, filteredSelectablePhotoCandidates, photoEvidencePreviewByKey]);

  useEffect(() => {
    const key = String(photoZoomEvidenceKey || '').trim();
    if (!key || photoEvidencePreviewByKey[key]) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/field-reports/evidence/view?key=${encodeURIComponent(key)}`);
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const url = String(json?.url || '').trim();
        if (!cancelled && url) {
          setPhotoEvidencePreviewByKey((prev) => ({ ...prev, [key]: url }));
        }
      } catch {}
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [photoZoomEvidenceKey, photoEvidencePreviewByKey]);

  useEffect(() => {
    let cancelled = false;
    const visibleKeys = (activePhotoEvidenceGroup?.group?.items || [])
      .map((item) => String(item?.evidence?.key || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    const pending = visibleKeys.filter((key) => {
      if (!photoEvidencePreviewByKey[key]) return false;
      return !photoEvidenceRatioByKey[key];
    });
    if (pending.length === 0) return;

    const loadRatios = async () => {
      const updates: Record<string, number> = {};
      await Promise.all(pending.map(async (key) => {
        const src = String(photoEvidencePreviewByKey[key] || '').trim();
        if (!src) return;
        try {
          const ratio = await new Promise<number>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const w = Number(img.naturalWidth || img.width || 0);
              const h = Number(img.naturalHeight || img.height || 0);
              if (!w || !h) return reject(new Error('invalid image size'));
              resolve(w / h);
            };
            img.onerror = () => reject(new Error('image load error'));
            img.src = src;
          });
          updates[key] = ratio;
        } catch {}
      }));
      if (cancelled) return;
      if (Object.keys(updates).length > 0) {
        setPhotoEvidenceRatioByKey((prev) => ({ ...prev, ...updates }));
      }
    };

    void loadRatios();
    return () => {
      cancelled = true;
    };
  }, [activePhotoEvidenceGroup, photoEvidencePreviewByKey, photoEvidenceRatioByKey]);

  useEffect(() => {
    setPhotoPreviewSlide((prev) => Math.min(prev, Math.max(0, totalPhotoSlides - 1)));
  }, [totalPhotoSlides]);

  useEffect(() => {
    if (activeTab !== 'photo-report') return;
    let cancelled = false;
    setPhotoConfigHydratedKey('');
    setPhotoConfigExistsForScope(false);
    const load = async () => {
      try {
        const params = new URLSearchParams({
          report_no: String(photoCoverReportNo || '000'),
          period_start: String(photoPeriodStartDate || ''),
          period_end: String(photoPeriodEndDate || ''),
        });
        const json = await fetchPhotoReportConfig(params.toString());
        if (cancelled) return;
        const cfg = json?.config || null;
        setPhotoConfigExistsForScope(Boolean(cfg));
        const hidden = cfg?.hidden_image_keys && typeof cfg.hidden_image_keys === 'object' ? cfg.hidden_image_keys : {};
        const legacyIncluded = Object.entries(hidden).reduce<Record<string, true>>((acc, [key, value]) => {
          const normalized = String(key || '').trim();
          if (normalized && !normalized.startsWith('__') && value) acc[normalized] = true;
          return acc;
        }, {});
        if (hidden?.__mode === 'include' && hidden?.__included && typeof hidden.__included === 'object') {
          const includedSerialized = JSON.stringify(hidden.__included);
          setIncludedPhotoEvidenceKeys((prev) => (JSON.stringify(prev || {}) === includedSerialized ? prev : hidden.__included));
        } else if (Object.keys(legacyIncluded).length > 0) {
          const includedSerialized = JSON.stringify(legacyIncluded);
          setIncludedPhotoEvidenceKeys((prev) => (JSON.stringify(prev || {}) === includedSerialized ? prev : legacyIncluded));
        } else {
          setIncludedPhotoEvidenceKeys({});
        }
        const includedForOrder = hidden?.__mode === 'include' && hidden?.__included && typeof hidden.__included === 'object'
          ? Object.entries(hidden.__included).filter(([, value]) => value).map(([key]) => String(key || '').trim()).filter(Boolean)
          : Object.keys(legacyIncluded);
        const includedSet = new Set(includedForOrder);
        const persistedOrder = Array.isArray(hidden?.__included_order)
          ? hidden.__included_order.map((key: any) => String(key || '').trim()).filter((key: string) => key && includedSet.has(key))
          : [];
        const nextIncludedOrder = [
          ...persistedOrder,
          ...includedForOrder.filter((key) => key && !persistedOrder.includes(key)),
        ];
        const nextIncludedOrderSerialized = JSON.stringify(nextIncludedOrder);
        setIncludedPhotoEvidenceOrder((prev) => (JSON.stringify(prev || []) === nextIncludedOrderSerialized ? prev : nextIncludedOrder));
        const titleOverrides = hidden?.__title_overrides && typeof hidden.__title_overrides === 'object'
          ? Object.entries(hidden.__title_overrides).reduce<Record<string, string>>((acc, [key, value]) => {
              const normalized = String(key || '').trim();
              if (normalized) acc[normalized] = String(value || '');
              return acc;
            }, {})
          : {};
        const titleOverridesSerialized = JSON.stringify(titleOverrides);
        setPhotoSlideTitleOverrides((prev) => (JSON.stringify(prev || {}) === titleOverridesSerialized ? prev : titleOverrides));
        const sectionTitles = hidden?.__section_titles && typeof hidden.__section_titles === 'object' ? hidden.__section_titles : {};
        setPhotoPage3AreaTitle(String(sectionTitles?.canaletas || 'ÁREA CANALETAS'));
        setPhotoPiscinasAreaTitle(String(sectionTitles?.piscinas || 'ÁREA PISCINAS'));
        setPhotoAdicionalesAreaTitle(String(sectionTitles?.adicionales || 'ADICIONALES'));
        setPhotoExportRangeStart('');
        setPhotoExportRangeEnd('');
      } catch {
        if (!cancelled) setPhotoConfigExistsForScope(false);
      } finally {
        if (!cancelled) {
          setPhotoConfigDirty(false);
          setPhotoConfigHydratedKey(photoPersistenceKey);
        }
      }
    };
    if (photoPeriodStartDate && photoPeriodEndDate) void load();
    else {
      setPhotoConfigDirty(false);
      setPhotoConfigHydratedKey(photoPersistenceKey);
    }
    return () => {
      cancelled = true;
    };
  }, [activeTab, photoPersistenceKey, photoCoverReportNo, photoPeriodStartDate, photoPeriodEndDate]);

  useEffect(() => {
    if (activeTab !== 'photo-report') return;
    let cancelled = false;
    const loadList = async () => {
      try {
        setSavedPhotoConfigsLoading(true);
        const json = await fetchPhotoReportConfig();
        if (cancelled) return;
        const list = Array.isArray(json?.configs) ? json.configs : [];
        setSavedPhotoConfigs(list);
      } catch {
        if (!cancelled) setSavedPhotoConfigs([]);
      } finally {
        if (!cancelled) setSavedPhotoConfigsLoading(false);
      }
    };
    void loadList();
    return () => {
      cancelled = true;
    };
  }, [activeTab, photoConfigHydratedKey]);

  useEffect(() => {
    if (!needsDetailedReports) {
      setLoading(false);
      return;
    }
    if (activeTab === 'activities' && !activitiesWeeksReady && !hasActivitiesSearchQuery) {
      setLoading(true);
      return;
    }
    if (activeTab === 'photo-report' && (!photoPeriodStartDate || !photoPeriodEndDate)) {
      setReports([]);
      setLoading(false);
      setError('');
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');

    const params = new URLSearchParams({ limit: '200', summary: '1' });
    if (activeTab === 'activities') {
      params.set('activities_only', '1');
      if (hasActivitiesSearchQuery) {
        params.set('limit', '1000');
        params.set('activity_search', activitiesSearchQuery.trim());
      }
    } else if (activeTab === 'crew-personnel') {
      params.set('include_calc', '1');
    }

    if (activeTab === 'activities' && !hasActivitiesSearchQuery) {
      params.set('date_from', activitiesWeekRange.start);
      params.set('date_to', activitiesWeekRange.end);
    } else if (photoPeriodStartDate && photoPeriodEndDate) {
      params.set('date_from', photoPeriodStartDate);
      params.set('date_to', photoPeriodEndDate);
    }

    const fetchKey = params.toString();

    fetchManagementFieldReports(fetchKey)
      .then((payload) => {
        if (mounted) setReports(payload);
      })
      .catch((err) => {
        if (mounted) {
          setReports([]);
          setError(err?.message || 'No se pudieron cargar los reportes de terreno.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab, activitiesSearchQuery, activitiesWeekRange.end, activitiesWeekRange.start, activitiesWeeksReady, hasActivitiesSearchQuery, needsDetailedReports, photoPeriodStartDate, photoPeriodEndDate]);

  useEffect(() => {
    if (activeTab !== 'activities') return;
    let mounted = true;
    fetchFieldReportDateKeys()
      .then((dates) => {
        if (!mounted) return;
        const cleanDates = Array.from(new Set(
          dates
            .map((date) => String(date || '').slice(0, 10))
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        )).sort((a, b) => b.localeCompare(a));
        const weeks = buildWeekRangesFromDateKeys(cleanDates);
        const currentWeek = getWeekRangeFromDateKey(dateToKey(new Date()));
        const latestWeek = weeks.find((range) => range.start <= currentWeek.start) || weeks[0] || currentWeek;
        setActivitiesAvailableDates(cleanDates);
        setActivitiesWeekRange((prev) => {
          const stillAvailable = weeks.some((range) => range.start === prev.start);
          return stillAvailable ? prev : latestWeek;
        });
        setActivitiesWeeksReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setActivitiesAvailableDates([]);
        setActivitiesWeeksReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'hh') return;
    let mounted = true;
    fetchFieldReportDateKeys()
      .then((dates) => {
        if (!mounted) return;
        const cleanDates = Array.from(new Set(
          dates
            .map((date) => String(date || '').slice(0, 10))
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        )).sort((a, b) => b.localeCompare(a));
        setHhAvailableDates(cleanDates);
      })
      .catch(() => {
        if (!mounted) return;
        setHhAvailableDates([]);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'hh') return;

    if (hhMatrixStartDate && hhMatrixEndDate && hhMatrixRangeHydratedFromSummaryRef.current && !hhMatrixManualRangeChangeRef.current) {
      hhMatrixRangeHydratedFromSummaryRef.current = false;
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (hhMatrixStartDate && hhMatrixEndDate) {
      params.set('date_from', hhMatrixStartDate);
      params.set('date_to', hhMatrixEndDate);
    }
    const fetchKey = params.toString();

    fetchManagementHhSummary(fetchKey)
      .then((payload: HhSummaryPayload) => {
        if (!mounted) return;
        setHhSummary(payload);
        if (!hhMatrixStartDate && !hhMatrixEndDate && payload?.date_from && payload?.date_to) {
          hhMatrixRangeHydratedFromSummaryRef.current = true;
          setHhMatrixStartDate(String(payload.date_from));
          setHhMatrixEndDate(String(payload.date_to));
        }
      })
      .catch((err) => {
        if (mounted) {
          setHhSummary(null);
          setError(err?.message || 'No se pudo cargar el resumen HH.');
        }
      })
      .finally(() => {
        hhMatrixManualRangeChangeRef.current = false;
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab, hhMatrixEndDate, hhMatrixStartDate, hhSummaryReloadNonce]);

  useEffect(() => {
    if (activeTab !== 'crew-personnel') return;
    let mounted = true;
    fetchCollaboratorSummary()
      .then((payload) => {
        if (mounted) setCollaboratorRows(payload);
      })
      .catch(() => {
        if (mounted) setCollaboratorRows([]);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const collaboratorLookupById = useMemo(() => {
    const map = new Map<string, any>();
    collaboratorRows.forEach((row) => {
      [row?.id, row?.user_id, row?.collaborator_id].forEach((value) => {
        const key = String(value || '').trim();
        if (key && !map.has(key)) map.set(key, row);
      });
    });
    return map;
  }, [collaboratorRows]);

  const loadInterferences = React.useCallback(async () => {
    setInterferencesLoading(true);
    setInterferencesError('');
    try {
      const response = await fetch('/api/management/interferences');
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      setInterferences(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      setInterferences([]);
      setInterferencesError(err?.message || 'No se pudieron cargar las interferencias.');
    } finally {
      setInterferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'interferences') return;
    void loadInterferences();
  }, [activeTab, loadInterferences]);

  const loadHistoricalHh = React.useCallback(async () => {
    setHistoricalHhLoading(true);
    setHistoricalHhError('');
    try {
      const payload = await fetchManagementHhHistory();
      setHistoricalHhRows(payload);
    } catch (err: any) {
      setHistoricalHhRows([]);
      setHistoricalHhError(err?.message || 'No se pudo cargar el histórico de HH.');
    } finally {
      setHistoricalHhLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'hh-history') return;
    void loadHistoricalHh();
  }, [activeTab, loadHistoricalHh]);

  const loadReportFronts = React.useCallback(async () => {
    setReportFrontsLoading(true);
    setReportFrontsError('');
    try {
      const response = await fetch('/api/report-fronts?include_inactive=1', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      const rows = Array.isArray(payload?.fronts) ? payload.fronts : (Array.isArray(payload) ? payload : []);
      setReportFronts(rows
        .filter((row: any) => String(row?.type || '').toLowerCase() !== 'ifa')
        .map((row: any) => ({
          id: row?.id ? String(row.id) : null,
          code: String(row?.code || ''),
          name: String(row?.name || ''),
          title_prefix: String(row?.title_prefix || ''),
          type: String(row?.type || 'udr'),
          sequence_mode: String(row?.sequence_mode || 'incremental'),
          next_sequence_no: row?.next_sequence_no === null || row?.next_sequence_no === undefined ? null : Number(row.next_sequence_no || 0),
          date_anchor: row?.date_anchor ? String(row.date_anchor).slice(0, 10) : '',
          date_anchor_sequence_no: row?.date_anchor_sequence_no === null || row?.date_anchor_sequence_no === undefined ? null : Number(row.date_anchor_sequence_no || 0),
          is_active: row?.is_active !== false,
          include_in_daily_activities: row?.include_in_daily_activities === true,
          sort_order: row?.sort_order === null || row?.sort_order === undefined ? null : Number(row.sort_order || 0),
        })));
    } catch (err: any) {
      setReportFronts([]);
      setReportFrontsError(err?.message || 'No se pudieron cargar los frentes.');
    } finally {
      setReportFrontsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'report-fronts') return;
    void loadReportFronts();
  }, [activeTab, loadReportFronts]);

  const openCreateReportFrontDialog = () => {
    setReportFrontDraft(DEFAULT_REPORT_FRONT_DRAFT);
    setReportFrontDialogOpen(true);
  };

  const openEditReportFrontDialog = (front: ReportFrontRow) => {
    if (String(front.type || '').toLowerCase() === 'base') return;
    setReportFrontDraft({
      id: front.id || null,
      code: front.code || '',
      name: front.name || '',
      title_prefix: front.title_prefix || '',
      type: (['base', 'ifa', 'udr', 'other'].includes(front.type) ? front.type : 'udr') as ReportFrontDraft['type'],
      sequence_mode: front.sequence_mode === 'date_anchor' ? 'date_anchor' : 'incremental',
      next_sequence_no: front.next_sequence_no == null ? '1' : String(front.next_sequence_no),
      date_anchor: front.date_anchor ? String(front.date_anchor).slice(0, 10) : '',
      date_anchor_sequence_no: front.date_anchor_sequence_no == null ? '' : String(front.date_anchor_sequence_no),
      is_active: front.is_active !== false,
      include_in_daily_activities: front.include_in_daily_activities === true,
      sort_order: front.sort_order == null ? '999' : String(front.sort_order),
    });
    setReportFrontDialogOpen(true);
  };

  const updateReportFrontDraft = (patch: Partial<ReportFrontDraft>) => {
    setReportFrontDraft((prev) => {
      const next = { ...prev, ...patch };
      if (patch.name !== undefined && !prev.title_prefix.trim()) {
        next.title_prefix = patch.name ? `REPORTE ${String(patch.name).trim().toUpperCase()}` : '';
      }
      if (patch.type === 'base') next.sequence_mode = 'date_anchor';
      return next;
    });
  };

  const saveReportFront = async () => {
    const name = String(reportFrontDraft.name || '').trim();
    if (!name) {
      setNotice({ message: 'Debes ingresar el nombre del frente.', severity: 'error' });
      return;
    }
    setReportFrontSaving(true);
    try {
      const isEdit = Boolean(reportFrontDraft.id);
      const payload = {
        ...reportFrontDraft,
        name,
        title_prefix: String(reportFrontDraft.title_prefix || `REPORTE ${name.toUpperCase()}`).trim(),
        next_sequence_no: Number(reportFrontDraft.next_sequence_no || 1),
        date_anchor: reportFrontDraft.sequence_mode === 'date_anchor' ? reportFrontDraft.date_anchor || null : null,
        date_anchor_sequence_no: reportFrontDraft.sequence_mode === 'date_anchor'
          ? (reportFrontDraft.date_anchor_sequence_no ? Number(reportFrontDraft.date_anchor_sequence_no) : null)
          : null,
        sort_order: Number(reportFrontDraft.sort_order || 999),
      };
      const response = await fetch('/api/report-fronts', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No se pudo guardar el frente.');
      setNotice({ message: isEdit ? 'Frente actualizado correctamente.' : 'Frente creado correctamente.', severity: 'success' });
      setReportFrontDialogOpen(false);
      await loadReportFronts();
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo guardar el frente.', severity: 'error' });
    } finally {
      setReportFrontSaving(false);
    }
  };

  const deactivateReportFront = async (front: ReportFrontRow) => {
    const id = String(front.id || '').trim();
    if (!id) return;
    setReportFrontSaving(true);
    try {
      const response = await fetch(`/api/report-fronts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No se pudo desactivar el frente.');
      setNotice({ message: 'Frente desactivado correctamente.', severity: 'success' });
      await loadReportFronts();
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo desactivar el frente.', severity: 'error' });
    } finally {
      setReportFrontSaving(false);
    }
  };

  const requestToggleReportFrontDailyActivities = (front: ReportFrontRow) => {
    const id = String(front.id || '').trim();
    if (!id || String(front.type || '').toLowerCase() === 'base') return;
    setDailyActivitiesConfirmFront(front);
  };

  const toggleReportFrontDailyActivities = async () => {
    const front = dailyActivitiesConfirmFront;
    const id = String(front?.id || '').trim();
    if (!front || !id || String(front.type || '').toLowerCase() === 'base') return;
    const nextValue = front.include_in_daily_activities !== true;
    setReportFrontSaving(true);
    try {
      const response = await fetch('/api/report-fronts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, include_in_daily_activities: nextValue }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No se pudo actualizar el frente.');
      setNotice({
        message: nextValue
          ? 'Frente habilitado para la hoja Actividades.'
          : 'Frente excluido de la hoja Actividades.',
        severity: 'success',
      });
      setDailyActivitiesConfirmFront(null);
      await loadReportFronts();
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo actualizar el frente.', severity: 'error' });
    } finally {
      setReportFrontSaving(false);
    }
  };

  const loadEquipmentForDate = React.useCallback(async () => {
    setEquipmentLoading(true);
    setEquipmentError('');
    try {
      const dateParam = String(equipmentDate || '').slice(0, 10);
      const response = await fetch(`/api/management/equipment?date=${encodeURIComponent(dateParam)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      const availableDates = Array.isArray(payload?.available_dates)
        ? payload.available_dates.map((d: any) => String(d || '').slice(0, 10)).filter(Boolean)
        : [];
      setEquipmentAvailableDates(availableDates);

      let payloadToUse = payload;

      if (availableDates.length > 0 && dateParam && !availableDates.includes(dateParam)) {
        const fallbackResponse = await fetch(`/api/management/equipment?date=${encodeURIComponent(dateParam)}&fallback=on_or_before`);
        const fallbackPayload = await fallbackResponse.json().catch(() => null);

        if (fallbackResponse.ok && fallbackPayload) {
          payloadToUse = fallbackPayload;
        }
      }

      const snapshotDate = String(payloadToUse?.snapshot_date || dateParam || '').slice(0, 10);
      setEquipmentLoadedFromDate(snapshotDate);
      setEquipmentLastUpdatedAt(String(payloadToUse?.last_updated_at || '').trim());
      setEquipmentLastUpdatedBy(String(payloadToUse?.last_updated_by || '').trim());
      setEquipmentRows(normalizeEquipmentApiRows(Array.isArray(payloadToUse?.rows) ? payloadToUse.rows : [], snapshotDate));
    } catch (err: any) {
      setEquipmentRows([]);
      setEquipmentLoadedFromDate('');
      setEquipmentLastUpdatedAt('');
      setEquipmentLastUpdatedBy('');
      setEquipmentError(err?.message || 'No se pudieron cargar los equipos.');
    } finally {
      setEquipmentLoading(false);
    }
  }, [equipmentDate]);

  useEffect(() => {
    if (activeTab !== 'equipment') return;
    void loadEquipmentForDate();
  }, [activeTab, loadEquipmentForDate]);

  const persistEquipmentRows = async (
    rowsInput: ManagementEquipmentRow[],
    successMessage = 'Equipos guardados correctamente.',
    targetDateOverride?: string,
    options?: { propagateToFuture?: boolean; identityKeys?: string[] }
  ) => {
    setEquipmentSaving(true);
    setEquipmentError('');
    try {
      const targetDate = String(targetDateOverride || equipmentDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const sanitizedRows = rowsInput
        .map((row) => ({
          id: row.id,
          report_date: targetDate,
          equipment_kind: row.equipment_kind === 'MENOR' ? 'MENOR' : 'MAYOR',
          equipment_name: String(row.equipment_name || '').trim().toLowerCase(),
          patent: String(row.patent || '').trim().toLowerCase() || null,
          quantity: row.quantity === null || row.quantity === undefined || String(row.quantity).trim() === '' ? 1 : toNumber(row.quantity || 1),
          canaletas_qty: row.canaletas_qty === null || row.canaletas_qty === undefined || String(row.canaletas_qty).trim() === '' ? null : toNumber(row.canaletas_qty || 0),
          piscinas_qty: row.piscinas_qty === null || row.piscinas_qty === undefined || String(row.piscinas_qty).trim() === '' ? null : toNumber(row.piscinas_qty || 0),
          is_operational: Boolean(row.is_operational),
          in_maintenance: Boolean(row.in_maintenance),
          in_accreditation: Boolean(row.in_accreditation),
          in_breakdown: Boolean(row.in_breakdown),
          include_in_daily_report: row.include_in_daily_report !== false,
          entry_date: String(row.entry_date || '').slice(0, 10) || null,
          return_date: String(row.return_date || '').slice(0, 10) || null,
          mileage_km: row.mileage_km === null || row.mileage_km === undefined || String(row.mileage_km).trim() === '' ? null : toNumber(row.mileage_km || 0),
          notes: String(row.notes || '').trim() || null,
        }))
        .filter((row) => row.equipment_name);
      const response = await fetch('/api/management/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          rows: sanitizedRows,
          propagateToFuture: Boolean(options?.propagateToFuture),
          changedEquipmentIdentityKeys: options?.identityKeys || [],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      setNotice({ message: successMessage, severity: 'success' });
      const nextRows = (Array.isArray(payload?.rows) ? payload.rows : sanitizedRows).slice();
      nextRows.sort((a: any, b: any) => {
        const kindA = String(a?.equipment_kind || '');
        const kindB = String(b?.equipment_kind || '');
        if (kindA !== kindB) return kindA.localeCompare(kindB, 'es');
        const nameA = String(a?.equipment_name || '').toUpperCase();
        const nameB = String(b?.equipment_name || '').toUpperCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB, 'es');
        const patentA = String(a?.patent || '').toUpperCase();
        const patentB = String(b?.patent || '').toUpperCase();
        return patentA.localeCompare(patentB, 'es');
      });
      setEquipmentRows(nextRows);
      setEquipmentLoadedFromDate(String(payload?.snapshot_date || targetDate).slice(0, 10));
      setEquipmentAvailableDates((prev) => Array.from(new Set([...prev, targetDate])).sort((a, b) => b.localeCompare(a)));
      setEquipmentDate(targetDate);
      setEquipmentLastUpdatedAt(String(payload?.last_updated_at || '').trim());
      setEquipmentLastUpdatedBy(String(payload?.last_updated_by || '').trim());
      return true;
    } catch (err: any) {
      setEquipmentError(err?.message || 'No se pudieron guardar los equipos.');
      return false;
    } finally {
      setEquipmentSaving(false);
    }
  };

  const addEquipmentRow = (kind: EquipmentKind) => {
    setEquipmentRows((prev) => [...prev, createEmptyEquipmentRow(kind)]);
  };

  const removeEquipmentRow = async (index: number) => {
    const nextRows = equipmentRows.filter((_, idx) => idx !== index);
    const ok = await persistEquipmentRows(nextRows, 'Equipo eliminado correctamente.');
    if (!ok) {
      setNotice({ message: 'No se pudo eliminar el equipo.', severity: 'error' });
    }
  };

  const updateEquipmentRow = (index: number, patch: Partial<ManagementEquipmentRow>) => {
    setEquipmentRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const getEquipmentDailyReportAvailability = (row: ManagementEquipmentRow) => {
    const selectedDate = String(equipmentDate || '').slice(0, 10);
    const entryDate = String(row.entry_date || '').slice(0, 10);
    const returnDate = String(row.return_date || '').slice(0, 10);
    if (entryDate && selectedDate && entryDate > selectedDate) {
      return { available: false, reason: 'No se incluye: el equipo aún no ha ingresado en esta fecha.' };
    }
    if (returnDate && (!selectedDate || returnDate <= selectedDate)) {
      return { available: false, reason: 'No se incluye: el equipo tiene salida o devolución en esta fecha.' };
    }
    return { available: true, reason: '' };
  };

  const toggleEquipmentDailyReport = async (index: number) => {
    const row = equipmentRows[index];
    if (!row?.id || equipmentSaving) return;
    const availability = getEquipmentDailyReportAvailability(row);
    if (!availability.available) {
      setNotice({ message: availability.reason, severity: 'info' });
      return;
    }
    const nextValue = row.include_in_daily_report === false;
    setEquipmentSaving(true);
    setEquipmentError('');
    try {
      const response = await fetch('/api/management/equipment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, include_in_daily_report: nextValue }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
      setEquipmentRows((current) => current.map((item, itemIndex) => (
        itemIndex === index ? { ...item, include_in_daily_report: nextValue } : item
      )));
      setNotice({
        message: nextValue
          ? 'El equipo se incluirá en el reporte diario de esta fecha.'
          : 'El equipo no se incluirá en el reporte diario de esta fecha.',
        severity: 'success',
      });
    } catch (err: any) {
      setEquipmentError(err?.message || 'No se pudo actualizar la declaración del equipo.');
    } finally {
      setEquipmentSaving(false);
    }
  };

  const openCreateEquipmentModal = (kind: EquipmentKind) => {
    setEquipmentModalMode('create');
    setEditingEquipmentIndex(null);
    setEquipmentNameCustomMode(false);
    setEquipmentEffectiveDate(String(equipmentDate || new Date().toISOString().slice(0, 10)).slice(0, 10));
    const empty = createEmptyEquipmentRow(kind);
    setEquipmentDraft(empty);
    setEquipmentInitialDraft(empty);
    setEquipmentModalOpen(true);
  };

  const openEditEquipmentModal = (index: number) => {
    const row = equipmentRows[index];
    if (!row) return;
    setEquipmentModalMode('edit');
    setEditingEquipmentIndex(index);
    setEquipmentNameCustomMode(false);
    setEquipmentEffectiveDate(String(equipmentDate || row.report_date || new Date().toISOString().slice(0, 10)).slice(0, 10));
    const snapshot = { ...row };
    setEquipmentDraft(snapshot);
    setEquipmentInitialDraft(snapshot);
    setEquipmentModalOpen(true);
  };

  const saveEquipmentModal = async () => {
    if (!equipmentDraft) return;
    if (!String(equipmentDraft.equipment_name || '').trim()) {
      setNotice({ message: 'Debes seleccionar o ingresar el nombre del equipo.', severity: 'error' });
      return;
    }
    const nonOperationalSelectedCount = [
      Boolean(equipmentDraft.in_maintenance),
      Boolean(equipmentDraft.in_accreditation),
      Boolean(equipmentDraft.in_breakdown),
      Boolean(equipmentDraft.return_date),
    ].filter(Boolean).length;
    if (!equipmentDraft.is_operational) {
      if (nonOperationalSelectedCount !== 1) {
        setNotice({
          message: 'Si el equipo no está operativa, debes seleccionar solo un estado: Mantención, Acreditación, Panne o Salida / Devolución.',
          severity: 'error',
        });
        return;
      }
    }
    const normalizedQuantity =
      equipmentDraft.quantity === null || equipmentDraft.quantity === undefined || String(equipmentDraft.quantity).trim() === ''
        ? 1
        : toNumber(equipmentDraft.quantity || 1);
    const normalizedCanaletas =
      equipmentDraft.canaletas_qty === null || equipmentDraft.canaletas_qty === undefined || String(equipmentDraft.canaletas_qty).trim() === ''
        ? 0
        : toNumber(equipmentDraft.canaletas_qty || 0);
    const normalizedPiscinas =
      equipmentDraft.piscinas_qty === null || equipmentDraft.piscinas_qty === undefined || String(equipmentDraft.piscinas_qty).trim() === ''
        ? 0
        : toNumber(equipmentDraft.piscinas_qty || 0);
    if (normalizedCanaletas + normalizedPiscinas > normalizedQuantity) {
      setNotice({
        message: 'CANALETAS + PISCINAS no puede ser mayor que Cantidad.',
        severity: 'error',
      });
      return;
    }
    const effectiveDate = String(equipmentEffectiveDate || equipmentDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      setNotice({ message: 'Debes indicar una fecha válida para aplicar el cambio.', severity: 'error' });
      return;
    }
    const entryDate = String(equipmentDraft.entry_date || '').slice(0, 10) || null;
    const returnDate = String(equipmentDraft.return_date || '').slice(0, 10) || null;
    if (entryDate && returnDate && entryDate > returnDate) {
      setNotice({ message: 'La fecha de salida no puede ser anterior a la fecha de ingreso.', severity: 'error' });
      return;
    }
    const normalized: ManagementEquipmentRow = {
      ...equipmentDraft,
      report_date: effectiveDate,
      equipment_kind: equipmentDraft.equipment_kind === 'MENOR' ? 'MENOR' : 'MAYOR',
      equipment_name: String(equipmentDraft.equipment_name || '').toLowerCase(),
      patent: String(equipmentDraft.patent || '').toLowerCase(),
      quantity: normalizedQuantity,
      canaletas_qty: normalizedCanaletas,
      piscinas_qty: normalizedPiscinas,
      entry_date: entryDate,
      return_date: returnDate,
      mileage_km:
        equipmentDraft.mileage_km === null ||
        equipmentDraft.mileage_km === undefined ||
        String(equipmentDraft.mileage_km).trim() === ''
          ? null
          : toNumber(equipmentDraft.mileage_km || 0),
      notes: String(equipmentDraft.notes || ''),
    };
    try {
      const targetDate = effectiveDate;
      const baseRows = targetDate === String(equipmentDate || '').slice(0, 10)
        ? equipmentRows
        : await (async () => {
            const response = await fetch(`/api/management/equipment?date=${encodeURIComponent(targetDate)}&fallback=on_or_before`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
            return normalizeEquipmentApiRows(Array.isArray(payload?.rows) ? payload.rows : [], String(payload?.snapshot_date || targetDate).slice(0, 10));
          })();
      const matchKey = equipmentModalMode === 'edit' && equipmentInitialDraft
        ? equipmentIdentityKey(equipmentInitialDraft)
        : equipmentIdentityKey(normalized);
      const duplicateRow = baseRows.find((row) => {
        const isCurrentEditedRow = equipmentModalMode === 'edit' && equipmentIdentityKey(row) === matchKey;
        return !isCurrentEditedRow && isSameEquipment(row, normalized);
      });
      if (duplicateRow) {
        const identifier = String(normalized.patent || '').trim()
          ? `la patente / Nº / serie ${String(normalized.patent).toUpperCase()}`
          : `el nombre ${String(normalized.equipment_name).toUpperCase()}`;
        setNotice({ message: `Ya existe un equipo registrado con ${identifier}.`, severity: 'error' });
        return;
      }
      const existingIdx = baseRows.findIndex((row) => equipmentIdentityKey(row) === matchKey);
      const nextRows = existingIdx >= 0
        ? baseRows.map((row, idx) => (idx === existingIdx ? { ...row, ...normalized, report_date: targetDate } : row))
        : [...baseRows, { ...normalized, report_date: targetDate }];
      const successMessage = equipmentModalMode === 'edit' ? 'Equipo actualizado correctamente.' : 'Equipo creado correctamente.';
      const identityKeys = Array.from(new Set([matchKey, equipmentIdentityKey(normalized)]));
      const futureDates = equipmentAvailableDates.filter((snapshotDate) => snapshotDate > targetDate);

      if (futureDates.length > 0) {
        setEquipmentPropagationConfirm({
          rows: nextRows,
          targetDate,
          successMessage,
          identityKeys,
          futureDates,
        });
        return;
      }

      const ok = await persistEquipmentRows(nextRows, successMessage, targetDate, { identityKeys });
      if (ok) {
        setEquipmentModalOpen(false);
        setEquipmentDraft(null);
        setEditingEquipmentIndex(null);
      }
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo guardar el equipo en la fecha indicada.', severity: 'error' });
    }
  };

  const reportDateKeys = useMemo(() => {
    return Array.isArray(hhSummary?.dates) ? hhSummary.dates.slice().sort() : [];
  }, [hhSummary]);

  useEffect(() => {
    if (reportDateKeys.length === 0) return;
    if (hhMatrixStartDate || hhMatrixEndDate) return;
    const latestDate = reportDateKeys[reportDateKeys.length - 1];
    const week = getWeekRangeFromDateKey(latestDate);
    setHhMatrixStartDate(week.start || latestDate);
    setHhMatrixEndDate(week.end || latestDate);
  }, [hhMatrixEndDate, hhMatrixStartDate, reportDateKeys]);

  const hhMatrixRange = useMemo(() => {
    return {
      start: hhMatrixStartDate,
      end: hhMatrixEndDate || hhMatrixStartDate,
    };
  }, [hhMatrixEndDate, hhMatrixStartDate]);

  const hhVisibleWeekLabel = useMemo(() => {
    if (!hhMatrixRange.start || !hhMatrixRange.end) return 'Semana HH: cargando...';
    return `Semana HH ${getProjectWeekNumber(hhMatrixRange.start)}: ${formatSpanishShortDate(hhMatrixRange.start)} al ${formatSpanishShortDate(hhMatrixRange.end)}`;
  }, [hhMatrixRange.end, hhMatrixRange.start]);

  const currentCalendarWeekRange = useMemo(() => getWeekRangeFromDateKey(dateToKey(new Date())), []);
  const hhAvailableWeeks = useMemo(() => buildWeekRangesFromDateKeys(hhAvailableDates), [hhAvailableDates]);
  const hhWeekOptions = useMemo(() => {
    const baseWeeks = hhAvailableWeeks.length > 0 ? hhAvailableWeeks : (reportDateKeys.length > 0 ? buildWeekRangesFromDateKeys(reportDateKeys) : []);
    const selectedWeek = hhMatrixRange.start ? getWeekRangeFromDateKey(hhMatrixRange.start) : null;
    if (!selectedWeek?.start) return baseWeeks.length > 0 ? baseWeeks : [currentCalendarWeekRange];
    const hasSelectedWeek = baseWeeks.some((range) => range.start === selectedWeek.start);
    if (hasSelectedWeek) return baseWeeks;
    return [selectedWeek, ...baseWeeks].sort((a, b) => b.start.localeCompare(a.start));
  }, [currentCalendarWeekRange, hhAvailableWeeks, hhMatrixRange.start, reportDateKeys]);
  const activitiesAvailableWeeks = useMemo(() => buildWeekRangesFromDateKeys(activitiesAvailableDates), [activitiesAvailableDates]);
  const latestAvailableActivitiesWeek = useMemo(
    () => activitiesAvailableWeeks.find((range) => range.start <= currentCalendarWeekRange.start) || activitiesAvailableWeeks[0] || currentCalendarWeekRange,
    [activitiesAvailableWeeks, currentCalendarWeekRange]
  );
  const selectedActivitiesWeekIndex = activitiesWeekRange
    ? activitiesAvailableWeeks.findIndex((range) => range.start === activitiesWeekRange.start)
    : -1;
  const previousActivitiesWeek = selectedActivitiesWeekIndex >= 0
    ? activitiesAvailableWeeks[selectedActivitiesWeekIndex + 1] || null
    : null;
  const nextActivitiesWeekCandidate = selectedActivitiesWeekIndex > 0
    ? activitiesAvailableWeeks[selectedActivitiesWeekIndex - 1] || null
    : null;
  const nextActivitiesWeek = nextActivitiesWeekCandidate && nextActivitiesWeekCandidate.start <= currentCalendarWeekRange.start
    ? nextActivitiesWeekCandidate
    : null;
  const isViewingLatestActivitiesWeek = Boolean(
    activitiesWeekRange &&
    latestAvailableActivitiesWeek &&
    activitiesWeekRange.start === latestAvailableActivitiesWeek.start
  );
  const activitiesWeekLabel = activitiesWeekRange?.start && activitiesWeekRange?.end
    ? `Semana ${getProjectWeekNumber(activitiesWeekRange.start)}: ${formatSpanishShortDate(activitiesWeekRange.start)} al ${formatSpanishShortDate(activitiesWeekRange.end)}`
    : 'Semana: cargando...';
  const latestAvailableWeekRange = useMemo(() => {
    const fromAvailableWeeks = hhAvailableWeeks.find((range) => range.start <= currentCalendarWeekRange.start);
    if (fromAvailableWeeks) return fromAvailableWeeks;
    if (hhSummary?.date_from || hhSummary?.date_to) {
      return getWeekRangeFromDateKey(String(hhSummary.date_from || hhSummary.date_to || ''));
    }
    return { start: '', end: '' };
  }, [currentCalendarWeekRange.start, hhAvailableWeeks, hhSummary?.date_from, hhSummary?.date_to]);
  const canNavigateHhWeek = Boolean(hhMatrixRange.start || hhSummary?.date_from);
  const nextHhWeekStart = useMemo(() => {
    const baseStart = hhMatrixRange.start || hhSummary?.date_from || hhSummary?.date_to || '';
    if (!baseStart) return '';
    const normalized = getWeekRangeFromDateKey(baseStart);
    return addDaysToDateKey(normalized.start || baseStart, 7);
  }, [hhMatrixRange.start, hhSummary?.date_from, hhSummary?.date_to]);
  const isViewingLatestAvailableHhWeek = Boolean(
    hhMatrixRange.start &&
    latestAvailableWeekRange.start &&
    hhMatrixRange.start === latestAvailableWeekRange.start
  );
  const canNavigateHhNextWeek = canNavigateHhWeek && Boolean(
    nextHhWeekStart &&
    currentCalendarWeekRange.start &&
    nextHhWeekStart <= currentCalendarWeekRange.start
  );

  const moveHhWeek = React.useCallback((direction: -1 | 1) => {
    const baseStart = hhMatrixRange.start || hhSummary?.date_from || '';
    const baseEnd = hhMatrixRange.end || hhSummary?.date_to || '';
    if (!baseStart && !baseEnd) return;
    const normalized = getWeekRangeFromDateKey(baseStart || baseEnd);
    const start = addDaysToDateKey(normalized.start || baseStart || baseEnd, direction * 7);
    const end = addDaysToDateKey(start, 6);
    if (!start || !end) return;
    if (direction > 0 && currentCalendarWeekRange.start && start > currentCalendarWeekRange.start) return;
    hhMatrixManualRangeChangeRef.current = true;
    setHhMatrixStartDate(start);
    setHhMatrixEndDate(end);
  }, [currentCalendarWeekRange.start, hhMatrixRange.end, hhMatrixRange.start, hhSummary?.date_from, hhSummary?.date_to]);

  const loadLatestHhWeek = React.useCallback(() => {
    if (isViewingLatestAvailableHhWeek) return;
    hhMatrixManualRangeChangeRef.current = false;
    hhMatrixRangeHydratedFromSummaryRef.current = false;
    setHhMatrixStartDate('');
    setHhMatrixEndDate('');
    setHhSummaryReloadNonce((value) => value + 1);
  }, [isViewingLatestAvailableHhWeek]);

  const hhMatrixWeeks = useMemo(() => {
    if (Array.isArray(hhSummary?.weeks) && hhSummary.weeks.length > 0) return hhSummary.weeks;
    return buildProjectWeeksBetween(hhMatrixRange.start, hhMatrixRange.end);
  }, [hhMatrixRange.end, hhMatrixRange.start, hhSummary]);

  const hhMatrixRows = useMemo<HhMatrixRow[]>(() => {
    return Array.isArray(hhSummary?.matrix_rows) ? hhSummary.matrix_rows : [];
  }, [hhSummary]);

  const hhMatrixFrontOptions = useMemo(() => {
    return Array.from(new Set(hhMatrixRows.map((row) => String(row.front || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
  }, [hhMatrixRows]);

  const hhMatrixNonBaseFrontOptions = useMemo(() => {
    return hhMatrixFrontOptions.filter((front) => !isHhMatrixBaseFront(front));
  }, [hhMatrixFrontOptions]);

  const hhMatrixSpecialtyOptions = useMemo(() => {
    return Array.from(new Set(hhMatrixRows.map((row) => String(row.specialty || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
  }, [hhMatrixRows]);

  const hhMatrixPositionOptions = useMemo(() => {
    return Array.from(new Set(hhMatrixRows.map((row) => String(row.position || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
  }, [hhMatrixRows]);

  const filteredHhMatrixRows = useMemo(() => {
    return hhMatrixRows.filter((row) => {
      if (hhMatrixFrontFilter === HH_MATRIX_NON_BASE_ALL_TIME) {
        if (isHhMatrixBaseFront(row.front)) return false;
        if (hhMatrixNonBaseFrontFilter && row.front !== hhMatrixNonBaseFrontFilter) return false;
      } else if (hhMatrixFrontFilter && row.front !== hhMatrixFrontFilter) {
        return false;
      }

      if (hhMatrixSpecialtyFilter && row.specialty !== hhMatrixSpecialtyFilter) return false;
      if (hhMatrixPositionFilter && row.position !== hhMatrixPositionFilter) return false;
      return true;
    });
  }, [
    hhMatrixFrontFilter,
    hhMatrixNonBaseFrontFilter,
    hhMatrixPositionFilter,
    hhMatrixRows,
    hhMatrixSpecialtyFilter,
  ]);

  const sortedHhMatrixRows = useMemo(() => {
    const valueFor = (row: HhMatrixRow, key: string): string | number => {
      if (key === 'specialty' || key === 'position' || key === 'front') return String(row[key] || '');
      if (key === 'peopleRows' || key === 'reports' || key === 'hh' || key === 'hhExtras' || key === 'dailyReportHh') return Number(row[key] || 0);
      if (key === 'totalHh') return Number(row.hh || 0) + Number(row.hhExtras || 0);
      if (key.startsWith('week:')) return Number(row.byWeek[key.slice(5)] || 0);
      return '';
    };

    return [...filteredHhMatrixRows].sort((a, b) => {
      const aValue = valueFor(a, hhMatrixSort.key);
      const bValue = valueFor(b, hhMatrixSort.key);
      const comparison = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'es', { numeric: true, sensitivity: 'base' });
      if (comparison !== 0) return hhMatrixSort.direction === 'asc' ? comparison : -comparison;
      return a.key.localeCompare(b.key, 'es');
    });
  }, [filteredHhMatrixRows, hhMatrixSort]);

  const toggleHhMatrixSort = React.useCallback((key: string) => {
    setHhMatrixSort((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: ['specialty', 'position', 'front'].includes(key) ? 'asc' : 'desc' }
    ));
  }, []);

  const hhMatrixSortLabel = (label: React.ReactNode, key: string) => (
    <TableSortLabel
      active={hhMatrixSort.key === key}
      direction={hhMatrixSort.key === key ? hhMatrixSort.direction : 'asc'}
      onClick={() => toggleHhMatrixSort(key)}
      sx={{
        fontWeight: 700,
        color: 'inherit',
        '&.Mui-active': { color: colors.blue3 },
        '& .MuiTableSortLabel-icon': { color: `${colors.blue6} !important`, opacity: 0.4 },
        '&.Mui-active .MuiTableSortLabel-icon': { opacity: 1 },
      }}
    >
      {label}
    </TableSortLabel>
  );

  const hhMatrixTotalsByWeek = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredHhMatrixRows.forEach((row) => {
      Object.entries(row.byWeek || {}).forEach(([weekKey, value]) => {
        totals[weekKey] = Number(totals[weekKey] || 0) + Number(value || 0);
      });
    });
    return totals;
  }, [filteredHhMatrixRows]);

  const hhMatrixGrandTotal = filteredHhMatrixRows.reduce(
    (acc, row) => acc + Number(row.hh || 0) + Number(row.hhExtras || 0),
    0
  );

  const dashboardByDay = useMemo<DayDashboardRow[]>(() => {
    return Array.isArray(hhSummary?.dashboard_by_day) ? hhSummary.dashboard_by_day : [];
  }, [hhSummary]);

  const dailyReportWeeklySummary = hhSummary?.daily_report_weekly_summary || null;
  const hasDailyReportWeeklySummary = Number(dailyReportWeeklySummary?.report_count || 0) > 0;
  const fallbackDirectHh = Number(hhSummary?.total_hh_directas || 0);
  const fallbackDirectHhExtras = Number(hhSummary?.total_hh_extras_directas || 0);
  const fallbackIndirectHh = dashboardByDay.reduce((acc, day) => acc + Number(day.indirectTurnoHhTotal || 0), 0);
  const fallbackIndirectRows = dashboardByDay.reduce((acc, day) => acc + Number(day.indirectTurnoTotal || 0), 0);
  const totalDirectHh = hasDailyReportWeeklySummary ? Number(dailyReportWeeklySummary?.direct_hh || 0) : fallbackDirectHh;
  const totalIndirectHh = hasDailyReportWeeklySummary ? Number(dailyReportWeeklySummary?.indirect_hh || 0) : fallbackIndirectHh;
  const totalWeeklyHh = hasDailyReportWeeklySummary
    ? Number(dailyReportWeeklySummary?.total_hh || 0)
    : (fallbackDirectHh + fallbackDirectHhExtras + fallbackIndirectHh);
  const weeklyFrontHhRows = useMemo(() => {
    const byFront = new Map<string, {
      label: string;
      hh: number;
      hhExtras: number;
      indirectHh: number;
      dailyReportDirectHh: number;
      totalHh: number;
      reports: number;
    }>();
    const addFront = (
      frontLabelRaw: any,
      values: {
        hh?: number;
        hhExtras?: number;
        indirectHh?: number;
        dailyReportDirectHh?: number;
        reports?: number;
      },
    ) => {
      const label = normalizeLabel(frontLabelRaw) || 'SIN FRENTE';
      const key = getManagementNocFrontGroupKey(label);
      const current = byFront.get(key) || {
        label,
        hh: 0,
        hhExtras: 0,
        indirectHh: 0,
        dailyReportDirectHh: 0,
        totalHh: 0,
        reports: 0,
      };
      current.label = pickPreferredManagementFrontLabel(current.label, label);
      current.hh += Number(values.hh || 0);
      current.hhExtras += Number(values.hhExtras || 0);
      current.indirectHh += Number(values.indirectHh || 0);
      current.dailyReportDirectHh += Number(values.dailyReportDirectHh || 0);
      current.reports = Math.max(current.reports, Number(values.reports || 0));
      current.totalHh = current.hh + current.hhExtras + current.indirectHh;
      byFront.set(key, current);
    };

    if (hasDailyReportWeeklySummary) {
      (dailyReportWeeklySummary?.by_front || []).forEach((front) => {
        addFront(front.front, {
          hh: Number(front.direct_hh || 0),
          indirectHh: Number(front.indirect_hh || 0),
          dailyReportDirectHh: Number(front.direct_hh || 0),
          reports: Number(front.reports || 0),
        });
      });
      return Array.from(byFront.values())
        .sort((a, b) => b.totalHh - a.totalHh || a.label.localeCompare(b.label, 'es'));
    }
    dashboardByDay.forEach((day) => {
      day.byFront.forEach((front) => {
        addFront(front.label, {
          hh: Number(front.hh || 0),
          hhExtras: Number(front.hhExtras || 0),
          dailyReportDirectHh: Number(front.dailyReportDirectHh || 0),
        });
      });
    });
    return Array.from(byFront.values())
      .sort((a, b) => b.totalHh - a.totalHh || a.label.localeCompare(b.label, 'es'));
  }, [dashboardByDay, dailyReportWeeklySummary, hasDailyReportWeeklySummary]);
  const weeklyHhCards = [
    {
      label: 'HH directas Rep. Diario',
      value: formatNumber(totalDirectHh),
      helper: hasDailyReportWeeklySummary ? 'Fuente principal: reporte diario' : 'Sin reporte diario: usando reportes de terreno',
    },
    {
      label: 'HH indirectas Rep. Diario',
      value: formatNumber(totalIndirectHh),
      helper: hasDailyReportWeeklySummary ? `${Number(dailyReportWeeklySummary?.report_count || 0)} reporte(s) diario(s)` : `${fallbackIndirectRows} registros turno`,
    },
    {
      label: 'Total HH Rep. Diario',
      value: formatNumber(totalWeeklyHh),
      helper: hasDailyReportWeeklySummary
        ? `${Number(dailyReportWeeklySummary?.report_count || 0)} reporte(s) diario(s)`
        : 'Sin reporte diario: respaldo de terreno',
    },
  ];
  const weeklySecondarySeriesLabel = hasDailyReportWeeklySummary ? 'Indirectas' : 'Extras';
  const weeklyHhSourceLabel = hasDailyReportWeeklySummary
    ? `Fuente principal: reporte diario (${Number(dailyReportWeeklySummary?.report_count || 0)} reporte(s))`
    : 'Sin reporte diario: usando respaldo de terreno';
  const weeklyCompositionChartData = useMemo(() => [
    { name: 'Directas', value: totalDirectHh, color: colors.blue6 },
    { name: weeklySecondarySeriesLabel, value: totalIndirectHh, color: colors.gold3 },
  ].filter((row) => Number(row.value || 0) > 0), [totalDirectHh, totalIndirectHh, weeklySecondarySeriesLabel]);
  const weeklyFrontChartData = useMemo(() => {
    return weeklyFrontHhRows
      .map((front) => {
        const name = String(front.label || 'SIN FRENTE').trim() || 'SIN FRENTE';
        const secondary = hasDailyReportWeeklySummary ? Number(front.indirectHh || 0) : Number(front.hhExtras || 0);
        const directas = Number(front.hh || 0);
        return {
          name,
          shortName: formatManagementFrontChartLabel(name),
          directas,
          secondary,
          total: Number(front.totalHh || directas + secondary),
          reports: Number(front.reports || 0),
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
  }, [hasDailyReportWeeklySummary, weeklyFrontHhRows]);
  const weeklyFrontChartHeight = Math.max(220, Math.min(340, weeklyFrontChartData.length * 34 + 62));

  const crewPersonnelRows = useMemo<ManagementCrewPersonnelRow[]>(() => {
    const rows: ManagementCrewPersonnelRow[] = [];
    reports.forEach((report, reportIdx) => {
      const date = String(report?.date || report?.report_date || '').slice(0, 10);
      const reportId = String(report?.id || `report-${reportIdx}`);
      const reportNoRaw = Number(report?.report_sequence_no || report?.report_no);
      const reportNo = Number.isFinite(reportNoRaw) && reportNoRaw > 0 ? reportNoRaw : null;
      const namesInReport = new Set<string>();

      getReportPersonnelFrontRows(report).forEach((person, personIdx) => {
        const personNameKey = normalizeText(person.name);
        if (personNameKey) namesInReport.add(personNameKey);
        rows.push({
          key: `${reportId}-${person.personKey}-${person.front}-${person.sourceIndex}-${personIdx}`,
          reportId,
          reportNo,
          date,
          front: person.front || 'SIN FRENTE',
          name: person.name || 'SIN NOMBRE',
          position: person.position || 'SIN CARGO',
          workerType: person.workerType || '-',
          rut: person.rut || '-',
          hh: Number(person.hh || 0),
          hhExtras: Number(person.hhExtras || 0),
          sourceIndex: person.sourceIndex,
        });
      });

      getReportSupervisorRows(report, namesInReport, collaboratorLookupById).forEach((person, supervisorIdx) => {
        rows.push({
          key: `${reportId}-${person.personKey}-${person.front}-${supervisorIdx}`,
          reportId,
          reportNo,
          date,
          front: person.front || 'SIN FRENTE',
          name: person.name || 'SIN NOMBRE',
          position: person.position || 'SUPERVISOR',
          workerType: person.workerType || 'INDIRECTO',
          rut: person.rut || '-',
          hh: Number(person.hh || 0),
          hhExtras: Number(person.hhExtras || 0),
          sourceIndex: person.sourceIndex,
        });
      });
    });

    const dedupedByPersonFront = new Map<string, ManagementCrewPersonnelRow>();
    rows.forEach((row) => {
      const documentKey = String(row.rut || '')
        .trim()
        .toUpperCase()
        .replace(/[^0-9K]/g, '');
      const personKey = documentKey && documentKey !== 'K'
        ? `doc:${documentKey}`
        : `name:${normalizeText(row.name)}|position:${normalizeText(row.position)}`;
      const key = [
        row.date,
        normalizeText(row.front),
        personKey,
      ].join('::');
      const current = dedupedByPersonFront.get(key);
      if (!current) {
        dedupedByPersonFront.set(key, {
          ...row,
          key: `dedup-${key}`,
        });
        return;
      }
      current.hh += Number(row.hh || 0);
      current.hhExtras += Number(row.hhExtras || 0);
      current.sourceIndex = Math.min(current.sourceIndex, row.sourceIndex);
      if ((!current.rut || current.rut === '-') && row.rut) current.rut = row.rut;
      if ((!current.position || current.position === 'SIN CARGO') && row.position) current.position = row.position;
      if ((!current.workerType || current.workerType === '-') && row.workerType) current.workerType = row.workerType;
      if (!current.reportNo && row.reportNo) {
        current.reportNo = row.reportNo;
        current.reportId = row.reportId;
      }
    });

    return Array.from(dedupedByPersonFront.values()).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.front !== b.front) return a.front.localeCompare(b.front, 'es');
      if (a.name !== b.name) return a.name.localeCompare(b.name, 'es');
      return a.sourceIndex - b.sourceIndex;
    });
  }, [reports, collaboratorLookupById]);

  const filteredCrewPersonnelRows = useMemo(() => {
    const query = normalizeText(crewPersonnelSearch);
    const dateFilter = String(crewPersonnelDateFilter || '').slice(0, 10);
    const frontFilter = normalizeText(crewPersonnelFrontFilter);
    const typeFilter = normalizeText(crewPersonnelTypeFilter);
    const hhFilter = String(crewPersonnelHhFilter || '');
    const extraHhFilter = String(crewPersonnelExtraHhFilter || '');
    return crewPersonnelRows.filter((row) => {
      if (dateFilter && row.date !== dateFilter) return false;
      if (frontFilter && normalizeText(row.front) !== frontFilter) return false;
      if (typeFilter && normalizeText(row.workerType) !== typeFilter) return false;
      const hh = Number(row.hh || 0);
      const hhExtras = Number(row.hhExtras || 0);
      if (hhFilter && getHourFilterKey(hh) !== hhFilter) return false;
      if (extraHhFilter && getHourFilterKey(hhExtras) !== extraHhFilter) return false;
      if (!query) return true;
      const haystack = [
        row.date,
        row.front,
        row.name,
        row.position,
        row.workerType,
        row.rut,
        row.reportId,
        row.reportNo ? `N°${row.reportNo}` : '',
      ].map((value) => normalizeText(value)).join(' ');
      return haystack.includes(query);
    });
  }, [crewPersonnelDateFilter, crewPersonnelExtraHhFilter, crewPersonnelFrontFilter, crewPersonnelHhFilter, crewPersonnelRows, crewPersonnelSearch, crewPersonnelTypeFilter]);

  const crewPersonnelFrontOptions = useMemo(() => {
    return Array.from(new Set(crewPersonnelRows.map((row) => String(row.front || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'));
  }, [crewPersonnelRows]);

  const crewPersonnelDateOptions = useMemo(() => {
    return Array.from(new Set(
      crewPersonnelRows
        .map((row) => String(row.date || '').slice(0, 10))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )).sort((a, b) => b.localeCompare(a));
  }, [crewPersonnelRows]);

  const crewPersonnelDateSet = useMemo(() => new Set(crewPersonnelDateOptions), [crewPersonnelDateOptions]);

  const crewPersonnelRowsForHourOptions = useMemo(() => {
    const query = normalizeText(crewPersonnelSearch);
    const dateFilter = String(crewPersonnelDateFilter || '').slice(0, 10);
    const frontFilter = normalizeText(crewPersonnelFrontFilter);
    const typeFilter = normalizeText(crewPersonnelTypeFilter);
    return crewPersonnelRows.filter((row) => {
      if (dateFilter && row.date !== dateFilter) return false;
      if (frontFilter && normalizeText(row.front) !== frontFilter) return false;
      if (typeFilter && normalizeText(row.workerType) !== typeFilter) return false;
      if (!query) return true;
      const haystack = [
        row.date,
        row.front,
        row.name,
        row.position,
        row.workerType,
        row.rut,
        row.reportId,
        row.reportNo ? `N°${row.reportNo}` : '',
      ].map((value) => normalizeText(value)).join(' ');
      return haystack.includes(query);
    });
  }, [crewPersonnelDateFilter, crewPersonnelFrontFilter, crewPersonnelRows, crewPersonnelSearch, crewPersonnelTypeFilter]);

  const buildHourOptions = (rows: ManagementCrewPersonnelRow[], field: 'hh' | 'hhExtras') => {
    const byKey = new Map<string, number>();
    rows.forEach((row) => {
      const value = Number(row[field] || 0);
      const key = getHourFilterKey(value);
      if (!byKey.has(key)) byKey.set(key, Number(key));
    });
    return Array.from(byKey.entries())
      .map(([key, value]) => ({ key, value, label: formatNumber(value) }))
      .sort((a, b) => a.value - b.value);
  };

  const crewPersonnelHhOptions = useMemo(
    () => buildHourOptions(crewPersonnelRowsForHourOptions, 'hh'),
    [crewPersonnelRowsForHourOptions]
  );

  const crewPersonnelExtraHhOptions = useMemo(
    () => buildHourOptions(crewPersonnelRowsForHourOptions, 'hhExtras'),
    [crewPersonnelRowsForHourOptions]
  );

  useEffect(() => {
    if (crewPersonnelHhFilter && !crewPersonnelHhOptions.some((option) => option.key === crewPersonnelHhFilter)) {
      setCrewPersonnelHhFilter('');
    }
  }, [crewPersonnelHhFilter, crewPersonnelHhOptions]);

  useEffect(() => {
    if (crewPersonnelExtraHhFilter && !crewPersonnelExtraHhOptions.some((option) => option.key === crewPersonnelExtraHhFilter)) {
      setCrewPersonnelExtraHhFilter('');
    }
  }, [crewPersonnelExtraHhFilter, crewPersonnelExtraHhOptions]);

  const crewPersonnelStats = useMemo(() => {
    const fronts = new Set<string>();
    const people = new Set<string>();
    filteredCrewPersonnelRows.forEach((row) => {
      if (row.front) fronts.add(row.front);
      people.add(`${normalizeText(row.rut)}::${normalizeText(row.name)}::${normalizeText(row.position)}`);
    });
    return {
      fronts: fronts.size,
      people: people.size,
      hh: filteredCrewPersonnelRows.reduce((acc, row) => acc + Number(row.hh || 0) + Number(row.hhExtras || 0), 0),
    };
  }, [filteredCrewPersonnelRows]);

  const managementActivities = useMemo<ManagementActivityRow[]>(() => {
    const rows: ManagementActivityRow[] = [];
    reports.forEach((report, reportIdx) => {
      const date = String(report?.date || report?.report_date || '').slice(0, 10);
      const reportId = String(report?.id || `report-${reportIdx}`);
      const reportNoRaw = Number(report?.report_sequence_no);
      const reportNo = Number.isFinite(reportNoRaw) && reportNoRaw > 0 ? reportNoRaw : null;
      const reportFront = normalizeLabel(report?.work_front || report?.front || report?.frente || report?.front_name || '');
      const reportArea = String(report?.area || '-').trim() || '-';
      const reportCrew = String(report?.crew_name || report?.crew_id || '-').trim() || '-';
      const reportSpecialty = normalizeLabel(report?.specialty || report?.especialidad || report?.discipline || '-');
      const reportStart = String(report?.start_time || '').trim();
      const reportEnd = String(report?.end_time || '').trim();
      const activities = parseJsonMaybe(report?.activities);
      const activityRows = Array.isArray(activities) ? activities : [];

      activityRows.forEach((activity: any, activityIdx: number) => {
        const name = String(
          activity?.activity ||
          activity?.activity_name ||
          activity?.name ||
          activity?.title ||
          activity?.description ||
          activity?.detalle ||
          activity?.task ||
          ''
        ).trim();
        if (!name) return;
        const quantity = toNumber(
          activity?.quantity ??
          activity?.qty ??
          activity?.cantidad ??
          activity?.avance ??
          activity?.value ??
          0
        );
        const unit = String(
          activity?.unit ||
          activity?.unidad ||
          activity?.uom ||
          activity?.measure ||
          ''
        ).trim();
        const front = normalizeLabel(
          activity?.activity_front ||
          activity?.work_front ||
          activity?.front ||
          activity?.frente ||
          reportFront ||
          'SIN FRENTE'
        );
        const startTime = String(activity?.start_time || activity?.inicio || reportStart || '').trim();
        const endTime = String(activity?.end_time || activity?.fin || reportEnd || '').trim();

        rows.push({
          reportId,
          reportNo,
          date,
          front: front || 'SIN FRENTE',
          area: reportArea,
          crew: reportCrew,
          specialty: reportSpecialty || '-',
          name,
          quantity,
          unit,
          startTime,
          endTime,
          sourceIndex: activityIdx + 1,
        });
      });
    });
    return rows.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.reportNo !== b.reportNo) return Number(a.reportNo || 0) - Number(b.reportNo || 0);
      if (a.reportId !== b.reportId) return a.reportId.localeCompare(b.reportId);
      return a.sourceIndex - b.sourceIndex;
    });
  }, [reports]);

  const filteredManagementActivities = useMemo(() => {
    const query = normalizeText(activitiesSearch);
    if (!query) return managementActivities;
    return managementActivities.filter((row) => {
      const haystack = [
        row.name,
        row.front,
        row.area,
        row.crew,
        row.specialty,
        row.unit,
        row.date,
        row.reportId,
        row.reportNo ? `N°${row.reportNo}` : '',
      ].map((value) => normalizeText(value)).join(' ');
      return haystack.includes(query);
    });
  }, [activitiesSearch, managementActivities]);

  const historicalHhByFront = useMemo<HistoricalHhFrontGroup[]>(() => {
    const map = new Map<string, HistoricalHhRecord[]>();
    historicalHhRows.forEach((row) => {
      const front = normalizeLabel(row.work_front || 'SIN FRENTE');
      const list = map.get(front) || [];
      list.push(row);
      map.set(front, list);
    });
    return Array.from(map.entries())
      .map(([front, rows]) => ({
        front,
        rows: rows.sort((a, b) => {
          const dateA = String(a.report_date || '').slice(0, 10);
          const dateB = String(b.report_date || '').slice(0, 10);
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          return Number(a.report_no || 0) - Number(b.report_no || 0);
        }),
        weekly: Array.from(rows.reduce((weekMap, row) => {
          const weekNo = Number(row.week_no || 0);
          if (!weekNo) return weekMap;
          const current = weekMap.get(weekNo) || { weekNo, indirectHh: 0, directHh: 0, hm: 0 };
          current.indirectHh += toNumber(row.indirect_hh);
          current.directHh += toNumber(row.direct_hh);
          current.hm += toNumber(row.major_hm_daily) + toNumber(row.minor_hm_daily);
          weekMap.set(weekNo, current);
          return weekMap;
        }, new Map<number, { weekNo: number; indirectHh: number; directHh: number; hm: number }>()).values())
          .sort((a, b) => a.weekNo - b.weekNo),
      }))
      .sort((a, b) => a.front.localeCompare(b.front, 'es'));
  }, [historicalHhRows]);
  const detailTypeOptions = MANAGEMENT_TIME_REASON_OPTIONS[interferenceForm.timeType] || [];

  const updateInterferenceForm = (patch: Partial<InterferenceFormState>) => {
    setInterferenceForm((prev) => ({ ...prev, ...patch }));
  };

  const resetInterferenceForm = () => {
    setInterferenceForm(DEFAULT_INTERFERENCE_FORM);
    setInterferenceFiles([]);
  };

  const exportVisibleCrewPersonnelRows = async () => {
    if (filteredCrewPersonnelRows.length === 0 || crewPersonnelExporting) return;
    setCrewPersonnelExporting(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PR Ingenit';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('Personal visible', {
        views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
      });

      const headers = ['Fecha', 'Frente', 'Nombre', 'Cargo', 'Tipo', 'RUT', 'HH', 'HH extras', 'Reporte'];
      worksheet.addRow(headers);

      filteredCrewPersonnelRows.forEach((row) => {
        worksheet.addRow([
          formatDate(row.date),
          row.front || '-',
          row.name || '-',
          row.position || '-',
          row.workerType || '-',
          formatChileanRut(row.rut),
          Number(row.hh || 0),
          Number(row.hhExtras || 0),
          row.reportNo ? `N°${row.reportNo}` : row.reportId.slice(0, 8),
        ]);
      });

      worksheet.columns = [
        { width: 14 },
        { width: 34 },
        { width: 36 },
        { width: 28 },
        { width: 14 },
        { width: 16 },
        { width: 12 },
        { width: 14 },
        { width: 14 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3F86' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell, colNumber) => {
          cell.alignment = {
            horizontal: [1, 5, 6, 7, 8, 9].includes(colNumber) ? 'center' : 'left',
            vertical: 'middle',
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
          if ([7, 8].includes(colNumber)) cell.numFmt = '#,##0.0';
        });
      });

      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, filteredCrewPersonnelRows.length + 1), column: headers.length },
      };

      const filterParts = [
        crewPersonnelDateFilter || 'visible',
        crewPersonnelFrontFilter ? safeFileName(crewPersonnelFrontFilter) : '',
        crewPersonnelTypeFilter ? safeFileName(crewPersonnelTypeFilter) : '',
        crewPersonnelHhFilter ? `hh-${crewPersonnelHhFilter}` : '',
        crewPersonnelExtraHhFilter ? `hh-extra-${crewPersonnelExtraHhFilter}` : '',
      ].filter(Boolean);
      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(`personal_cuadrillas_${filterParts.join('_')}.xlsx`, new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo exportar el personal visible.', severity: 'error' });
    } finally {
      setCrewPersonnelExporting(false);
    }
  };

  const exportHistoricalHhFront = async (frontGroup: HistoricalHhFrontGroup) => {
    if (!frontGroup?.rows?.length) return;
    setHistoricalHhExportingFront(frontGroup.front);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PR Ingenit';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('HH Hist.', {
        views: [{ showGridLines: false }],
        pageSetup: {
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          paperSize: 9,
          margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 },
        },
      });

      const startRow = 2;
      const startCol = 2;
      const mainLastCol = 14;
      const summaryStartCol = 16;
      const summaryLastCol = 18;
      const thinBorder = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      } as any;
      const mediumBorder = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'medium', color: { argb: 'FF000000' } },
      } as any;
      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as any;
      const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } } as any;

      const setCell = (row: number, col: number, value: any, options: any = {}) => {
        const cell = worksheet.getCell(row, col);
        cell.value = value;
        cell.border = options.border || thinBorder;
        cell.font = options.font || { size: 10 };
        cell.alignment = options.alignment || { vertical: 'middle', horizontal: typeof value === 'number' ? 'right' : 'center' };
        if (options.fill) cell.fill = options.fill;
        if (options.numFmt) cell.numFmt = options.numFmt;
        return cell;
      };

      const applyOuterBorder = (top: number, left: number, bottom: number, right: number) => {
        for (let row = top; row <= bottom; row += 1) {
          for (let col = left; col <= right; col += 1) {
            const cell = worksheet.getCell(row, col);
            const current = cell.border || thinBorder;
            cell.border = {
              top: row === top ? mediumBorder.top : current.top,
              left: col === left ? mediumBorder.left : current.left,
              bottom: row === bottom ? mediumBorder.bottom : current.bottom,
              right: col === right ? mediumBorder.right : current.right,
            };
          }
        }
      };

      worksheet.getColumn(1).width = 3;
      const widths: Record<number, number> = {
        2: 12,
        3: 13,
        4: 13,
        5: 13,
        6: 13,
        7: 12,
        8: 13,
        9: 13,
        10: 15,
        11: 14,
        12: 14,
        13: 16,
        14: 16,
        15: 4,
        16: 14,
        17: 14,
        18: 14,
      };
      Object.entries(widths).forEach(([col, width]) => {
        worksheet.getColumn(Number(col)).width = width;
      });
      worksheet.getRow(1).height = 12;

      const titleRow = startRow;
      worksheet.mergeCells(titleRow, startCol, titleRow, mainLastCol);
      setCell(titleRow, startCol, `HH HISTORICO - ${frontGroup.front}`, {
        font: { bold: true, size: 13 },
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
      worksheet.getRow(titleRow).height = 24;

      const headerRow = startRow + 2;
      const headers = [
        'N° Semana',
        'Fecha',
        'Daily Report N°',
        'HH Indirectas',
        'HH Directas',
        'HH Diarias',
        'HH I. Acum',
        'HH D. Acum',
        'HH totales Acum',
        'HM Mayores Diarias',
        'HM Mayores Acum',
        'HM Menores y mov Diarias',
        'HM Menores y mov Acum',
      ];
      headers.forEach((header, idx) => {
        setCell(headerRow, startCol + idx, header, {
          fill: headerFill,
          font: { bold: true, size: 10 },
          alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        });
      });
      worksheet.getRow(headerRow).height = 40;

      frontGroup.rows.forEach((row, idx) => {
        const rowNo = headerRow + 1 + idx;
        const values = [
          Number(row.week_no || 0) || '',
          formatDate(String(row.report_date || '')),
          row.report_no ? `N°${row.report_no}` : '',
          toNumber(row.indirect_hh),
          toNumber(row.direct_hh),
          toNumber(row.daily_hh),
          toNumber(row.indirect_hh_accum),
          toNumber(row.direct_hh_accum),
          toNumber(row.total_hh_accum),
          toNumber(row.major_hm_daily),
          toNumber(row.major_hm_accum),
          toNumber(row.minor_hm_daily),
          toNumber(row.minor_hm_accum),
        ];
        values.forEach((value, valueIdx) => {
          setCell(rowNo, startCol + valueIdx, value, {
            font: { size: 10 },
            alignment: { horizontal: valueIdx <= 2 ? 'center' : 'right', vertical: 'middle' },
            numFmt: valueIdx >= 3 ? '#,##0.0' : undefined,
          });
        });
      });

      const summaryHeaderRow = headerRow;
      ['HH Ind. Sem.', 'HH Dir. Sem.', 'HM Semanal'].forEach((header, idx) => {
        setCell(summaryHeaderRow, summaryStartCol + idx, header, {
          fill: headerFill,
          font: { bold: true, size: 10 },
          alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        });
      });
      worksheet.getRow(summaryHeaderRow).height = Math.max(worksheet.getRow(summaryHeaderRow).height || 0, 40);

      let summaryRow = summaryHeaderRow + 1;
      frontGroup.weekly.forEach((week) => {
        worksheet.mergeCells(summaryRow, summaryStartCol, summaryRow, summaryLastCol);
        setCell(summaryRow, summaryStartCol, `Semana ${week.weekNo}`, {
          font: { size: 10 },
          alignment: { horizontal: 'center', vertical: 'middle' },
        });
        summaryRow += 1;
        [week.indirectHh, week.directHh, week.hm].forEach((value, idx) => {
          setCell(summaryRow, summaryStartCol + idx, value, {
            fill: yellowFill,
            font: { bold: true, size: 10 },
            alignment: { horizontal: 'center', vertical: 'middle' },
            numFmt: '#,##0.0',
          });
        });
        summaryRow += 3;
      });

      const bottomRow = Math.max(headerRow + frontGroup.rows.length, summaryRow - 1);
      applyOuterBorder(titleRow, startCol, bottomRow, mainLastCol);
      applyOuterBorder(summaryHeaderRow, summaryStartCol, Math.max(summaryHeaderRow, summaryRow - 1), summaryLastCol);

      worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRow, showGridLines: false }];
      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(`hh_historico_${safeFileName(frontGroup.front)}.xlsx`, new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo exportar HH histórico.', severity: 'error' });
    } finally {
      setHistoricalHhExportingFront('');
    }
  };

  const uploadInterferenceImages = async (): Promise<InterferenceImageMeta[]> => {
    const uploaded: InterferenceImageMeta[] = [];
    for (const file of interferenceFiles) {
      const presignRes = await fetch('/api/management/interferences/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      const presignPayload = await presignRes.json().catch(() => null);
      if (!presignRes.ok) {
        throw new Error(presignPayload?.error || `No se pudo preparar la imagen ${file.name}`);
      }
      const uploadRes = await fetch(presignPayload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`No se pudo subir la imagen ${file.name}`);
      uploaded.push({
        name: file.name,
        size: file.size,
        type: file.type,
        key: presignPayload.key,
      });
    }
    return uploaded;
  };

  const saveInterference = async () => {
    const workFront = interferenceForm.workFront.trim();
    const timeDetail = interferenceForm.timeDetail.trim();
    const date = interferenceForm.date.trim();
    if (!workFront || !timeDetail) {
      setNotice({ message: 'Frente y Detalle tipo son obligatorios.', severity: 'error' });
      return;
    }
    if (!date) {
      setNotice({ message: 'Fecha es obligatoria.', severity: 'error' });
      return;
    }
    setInterferenceSaving(true);
    try {
      const images = await uploadInterferenceImages();
      const res = await fetch('/api/management/interferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_front: workFront,
          time_type: interferenceForm.timeType,
          time_detail: timeDetail,
          interference_date: date,
          start_time: interferenceForm.startTime.trim() || null,
          end_time: interferenceForm.endTime.trim() || null,
          note: interferenceForm.note,
          images,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'No se pudo guardar la interferencia.');
      if (payload?.id) {
        setInterferences((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
      }
      setNotice({ message: 'Interferencia guardada correctamente.', severity: 'success' });
      setInterferenceDialogOpen(false);
      resetInterferenceForm();
    } catch (err: any) {
      setNotice({ message: err?.message || 'No se pudo guardar la interferencia.', severity: 'error' });
    } finally {
      setInterferenceSaving(false);
    }
  };

  const renderPhotoGroupTitleInput = (group: PhotoSlideGroup, fallbackTitle: string) => {
    const value = normalizePhotoSlideTitle(photoSlideTitleOverrides[group.key] ?? group.defaultTitle ?? fallbackTitle);
    return (
      <AppTextField
        size="small"
        value={value}
        onChange={(event) => {
          const nextValue = normalizePhotoSlideTitle(event.target.value);
          setPhotoSlideTitleOverrides((prev) => ({ ...prev, [group.key]: nextValue }));
          setPhotoConfigDirty(true);
        }}
        inputProps={{ maxLength: 90 }}
        sx={{
          position: 'absolute',
          right: '2%',
          top: '7.4%',
          width: 'min(88%, 1120px)',
          zIndex: 3,
          '& .MuiOutlinedInput-root': {
            bgcolor: 'transparent',
            color: colors.white,
            borderRadius: 0,
            fontSize: 'clamp(0.42rem, 1.24cqw, 1rem)',
            fontWeight: 700,
            textTransform: 'uppercase',
            '& fieldset': { border: 'none' },
            '&:hover fieldset': { border: 'none' },
            '&.Mui-focused fieldset': { border: 'none' },
          },
          '& input': {
            py: { xs: 0.28, md: 0.42 },
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'clip',
          },
        }}
      />
    );
  };

  const renderPhotoPreviewSlot = (item: PhotoSlideItem | null, url: string, sx: any) => (
    <Box sx={{ ...sx, bgcolor: colors.slate200 }}>
      {url ? (
        <Box
          component="img"
          src={url}
          alt={item?.evidence?.name || 'Imagen'}
          sx={{ width: '100%', height: '100%', objectFit: item?.isVeryWide ? 'cover' : 'contain' }}
        />
      ) : null}
      {item ? (
        <>
          {item.evidence.activitySummary ? (
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                bgcolor: alpha(colors.slate900, 0.78),
                color: colors.white,
                px: { xs: 0.55, md: 0.9 },
                py: { xs: 0.35, md: 0.55 },
                fontSize: 'clamp(0.32rem, 0.82cqw, 0.68rem)',
                lineHeight: 1.2,
                fontWeight: 700,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              title={item.evidence.activitySummary}
            >
              {item.evidence.activitySummary}
            </Box>
          ) : null}
          <AppIconButton
            size="small"
            onClick={() => setPhotoEvidenceIncluded(item.evidence.key, false)}
            title="Quitar del reporte"
            aria-label="Quitar imagen fijada"
            sx={{
              position: 'absolute',
              right: 6,
              top: 6,
              bgcolor: alpha(colors.green800, 0.82),
              color: colors.white,
              '& .remove-icon': { display: 'none' },
              '&:hover': { bgcolor: alpha(colors.red600, 0.9) },
              '&:hover .pin-icon': { display: 'none' },
              '&:hover .remove-icon': { display: 'block' },
            }}
          >
            <PushPin className="pin-icon" fontSize="small" />
            <Trash2 className="remove-icon" size={16} />
          </AppIconButton>
        </>
      ) : null}
    </Box>
  );

  const renderPhotoPreviewGroupImages = (group: PhotoSlideGroup, urls: string[]) => {
    const first = group.items[0] || null;
    const second = group.items[1] || null;
    const third = group.items[2] || null;
    if (group.layout === 'one') {
      return renderPhotoPreviewSlot(first, urls[0] || '', {
        position: 'absolute',
        left: '12.5%',
        top: '17%',
        width: '75%',
        height: '74%',
      });
    }
    if (group.layout === 'three') {
      return (
        <>
          {renderPhotoPreviewSlot(first, urls[0] || '', { position: 'absolute', left: '2.2%', top: '19%', width: '30.4%', height: '72%' })}
          {renderPhotoPreviewSlot(second, urls[1] || '', { position: 'absolute', left: '34.8%', top: '19%', width: '30.4%', height: '72%' })}
          {renderPhotoPreviewSlot(third, urls[2] || '', { position: 'absolute', right: '2.2%', top: '19%', width: '30.4%', height: '72%' })}
        </>
      );
    }
    return (
      <>
        {renderPhotoPreviewSlot(first, urls[0] || '', { position: 'absolute', left: '2.2%', top: '19%', width: '46.8%', height: '72%' })}
        {renderPhotoPreviewSlot(second, urls[1] || '', { position: 'absolute', right: '2.2%', top: '19%', width: '46.8%', height: '72%' })}
      </>
    );
  };

  return (
    <Box sx={{ minHeight: '100vh', background: colors.gray10 }}>
      <Script src="https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js" strategy="afterInteractive" />
      <UserHeader title="Gestión y Datos" />
      {activeTabAllowed && activeTab === 'interferences' ? (
        <AppFloatingActionButton ariaLabel="Crear interferencia" tooltip="Crear interferencia" offset="tabs" onClick={() => setInterferenceDialogOpen(true)} />
      ) : activeTabAllowed && (activeTab === 'equipment' || activeTab === 'report-fronts') ? (
        <AppFloatingActionButton ariaLabel={activeTab === 'equipment' ? 'Agregar equipo' : 'Crear frente'} tooltip={activeTab === 'equipment' ? 'Agregar equipo' : 'Crear frente'} offset="tabs" onClick={() => activeTab === 'equipment' ? openCreateEquipmentModal('MAYOR') : openCreateReportFrontDialog()} />
      ) : null}
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          width: '100%',
          px: 1,
          py: 1,
        }}
      >
        <Stack spacing={0}>
          <Box sx={{ overflow: 'visible' }}>
            <AppTabs
              ariaLabel="Secciones de Gestión y Datos"
              value={activeTab}
              onChange={(value) => {
                if (isManagementTab(value) && allowedManagementTabSet.has(value)) setActiveTab(value);
              }}
              minItemWidth={150}
              items={[
                { value: 'hh', label: 'HH', icon: <QueryStatsOutlined /> },
                { value: 'hh-history', label: 'HH histórico', icon: <HistoryOutlined /> },
                { value: 'crew-personnel', label: 'Personal / Cuadrillas', icon: <GroupsOutlined /> },
                { value: 'activities', label: 'Actividades', icon: <AssignmentTurnedIn /> },
                { value: 'interferences', label: 'Interferencias', icon: <WarningAmberOutlined /> },
                { value: 'equipment', label: 'Maquinaria / Equipos', icon: <ConstructionOutlined /> },
                { value: 'report-fronts', label: 'Frentes / UDR', icon: <AccountTreeOutlined /> },
                { value: 'transmittal', label: 'Transmittal', icon: <SendOutlined /> },
                { value: 'photo-report', label: 'Informe Fotográfico', icon: <PhotoLibraryOutlined /> },
              ].filter((item) => allowedManagementTabSet.has(item.value as ManagementTab))}
              paperProps={{
                sx: {
                  position: 'fixed',
                  top: { xs: 56, md: 60 },
                  left: { xs: 0, md: 'var(--users-aside-width, 240px)' },
                  width: { xs: '100%', md: 'calc(100% - var(--users-aside-width, 240px))' },
                  zIndex: 1100,
                },
              }}
            />

            <Box sx={{ px: { xs: 0.1, md: 0.1 }, pb: { xs: 0.75, md: 1 }, pt: { xs: 10.4, md: 11.4 } }}>
              {!managementAccessResolved ? (
                <Paper variant="outlined" sx={{ py: 6, display: 'flex', justifyContent: 'center', borderColor: colors.managementBorder }}>
                  <CircularProgress size={26} />
                </Paper>
              ) : allowedManagementTabs.length === 0 ? (
                <AppAlert severity="warning">No tienes pestañas habilitadas en Gestión y Datos.</AppAlert>
              ) : activeTab === 'transmittal' ? (
                <TransmittalPanel />
              ) : activeTab === 'hh' ? (
              <>
              <AppWeekNavigator
                periodLabel={hhVisibleWeekLabel}
                value={hhMatrixRange.start || ''}
                options={hhWeekOptions.map((range) => ({
                  value: range.start,
                  shortLabel: `Semana ${getProjectWeekNumber(range.start)}`,
                  label: `Semana ${getProjectWeekNumber(range.start)} (${formatSpanishShortDate(range.start)} - ${formatSpanishShortDate(range.end)})`,
                }))}
                previousDisabled={!canNavigateHhWeek}
                nextDisabled={!canNavigateHhNextWeek}
                latestDisabled={isViewingLatestAvailableHhWeek}
                selectDisabled={loading}
                onPrevious={() => moveHhWeek(-1)}
                onNext={() => moveHhWeek(1)}
                onLatest={loadLatestHhWeek}
                onChange={(value) => {
                  const selected = hhWeekOptions.find((range) => range.start === value);
                  if (!selected) return;
                  hhMatrixManualRangeChangeRef.current = true;
                  hhMatrixRangeHydratedFromSummaryRef.current = false;
                  setHhMatrixStartDate(selected.start);
                  setHhMatrixEndDate(selected.end);
                }}
                sx={{ mb: { xs: 1, md: 1.25 }, borderColor: colors.blue13 }}
              />

              <Paper
                variant="outlined"
                sx={{
                  mb: { xs: 1.25, md: 1.5 },
                  p: { xs: 1.25, md: 1.5 },
                  borderColor: colors.blue13,
                  background: colors.white,
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={0.75}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                  sx={{ mb: 1 }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={{ color: colors.blue1, fontWeight: 700, lineHeight: 1.15 }}>
                      Resumen semanal Rep. Diario
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.gray4, fontWeight: 500 }}>
                      {weeklyHhSourceLabel}
                    </Typography>
                  </Box>
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gap: 1,
                    gridTemplateColumns: {
                      xs: '1fr',
                      lg: 'minmax(280px, 340px) minmax(240px, 0.65fr) minmax(0, 1.35fr)',
                    },
                    alignItems: 'stretch',
                  }}
                >
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 0.75,
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        lg: '1fr',
                      },
                    }}
                  >
                    {weeklyHhCards.map((card) => (
                      <Paper key={card.label} variant="outlined" sx={{ p: 1, minWidth: 0, minHeight: 58, borderColor: colors.blue13 }}>
                        <Stack spacing={0.2}>
                          <Typography variant="caption" sx={{ color: colors.gray4, fontWeight: 600 }} noWrap title={card.label}>
                            {card.label}
                          </Typography>
                          <Typography variant="h6" sx={{ color: colors.blue1, fontWeight: 700, lineHeight: 1.05 }}>
                            {card.value}
                          </Typography>
                          <Typography variant="caption" sx={{ color: colors.gray5, fontWeight: 500 }} noWrap title={card.helper}>
                            {card.helper}
                          </Typography>
                        </Stack>
                      </Paper>
                    ))}
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1,
                        minWidth: 0,
                        minHeight: 58,
                        borderColor: colors.blue13,
                        background: alpha(colors.blue15, 0.45),
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" sx={{ color: colors.blue1, fontWeight: 700 }} noWrap>
                            HH por rango
                          </Typography>
                          <Typography variant="caption" sx={{ color: colors.gray4, fontWeight: 500, display: 'block' }} noWrap>
                            Matriz detallada
                          </Typography>
                        </Box>
                        <AppButton
                          variant="contained"
                          size="small"
                          onClick={() => setHhMatrixDialogOpen(true)}
                          sx={{ flex: '0 0 auto', minHeight: 32, px: 1.5, fontWeight: 700, textTransform: 'none', whiteSpace: 'nowrap' }}
                        >
                          Abrir
                        </AppButton>
                      </Stack>
                    </Paper>
                  </Box>

                  <Paper variant="outlined" sx={{ p: 1, borderColor: colors.blue13, minHeight: 250 }}>
                    <Stack spacing={0.75} sx={{ height: '100%' }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ color: colors.blue1, fontWeight: 700, lineHeight: 1.15 }}>
                          Composición
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.gray4, fontWeight: 500 }}>
                          Directas vs {weeklySecondarySeriesLabel.toLowerCase()}
                        </Typography>
                      </Box>
                      {weeklyCompositionChartData.length > 0 ? (
                        <Box sx={{ position: 'relative', height: 158 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={weeklyCompositionChartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={46}
                                outerRadius={64}
                                paddingAngle={3}
                                stroke={colors.white}
                                strokeWidth={3}
                              >
                                {weeklyCompositionChartData.map((entry) => (
                                  <Cell key={entry.name} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                content={({ active, payload }: any) => {
                                  if (!active || !payload?.length) return null;
                                  const row = payload[0]?.payload;
                                  return (
                                    <Paper variant="outlined" sx={{ p: 1, borderColor: colors.blue13, background: colors.white }}>
                                      <Typography variant="caption" sx={{ color: colors.blue1, fontWeight: 700 }}>
                                        {row?.name}
                                      </Typography>
                                      <Typography variant="body2" sx={{ color: colors.gray3, fontWeight: 600 }}>
                                        {formatNumber(Number(row?.value || 0))} HH
                                      </Typography>
                                    </Paper>
                                  );
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <Stack spacing={0} alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                            <Typography variant="caption" sx={{ color: colors.gray5, fontWeight: 500, lineHeight: 1 }}>
                              Total
                            </Typography>
                            <Typography variant="subtitle1" sx={{ color: colors.blue1, fontWeight: 700, lineHeight: 1.05 }}>
                              {formatNumber(totalWeeklyHh)}
                            </Typography>
                          </Stack>
                        </Box>
                      ) : (
                        <Box sx={{ minHeight: 158, display: 'grid', placeItems: 'center', color: colors.gray5, fontWeight: 500 }}>
                          Sin datos HH.
                        </Box>
                      )}
                      <Stack spacing={0.45}>
                        {weeklyCompositionChartData.map((item) => (
                          <Stack key={item.name} direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                            <Stack direction="row" alignItems="center" spacing={0.6} sx={{ minWidth: 0 }}>
                              <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: item.color, flex: '0 0 auto' }} />
                              <Typography variant="caption" sx={{ color: colors.gray4, fontWeight: 600 }} noWrap>
                                {item.name}
                              </Typography>
                            </Stack>
                            <Typography variant="caption" sx={{ color: colors.blue1, fontWeight: 700 }}>
                              {formatNumber(item.value)}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Stack>
                  </Paper>

                  <Paper variant="outlined" sx={{ p: 1, borderColor: colors.blue13, minHeight: 250 }}>
                    <Stack spacing={0.75}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ color: colors.blue1, fontWeight: 700, lineHeight: 1.15 }}>
                          HH por frente
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.gray4, fontWeight: 500 }}>
                          Distribución semanal desde la fuente activa.
                        </Typography>
                      </Box>
                      {weeklyFrontChartData.length > 0 ? (
                        <Box sx={{ height: weeklyFrontChartHeight, minHeight: 220 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={weeklyFrontChartData}
                              layout="vertical"
                              margin={{ top: 4, right: 14, left: 0, bottom: 0 }}
                              barCategoryGap={10}
                            >
                              <CartesianGrid stroke={alpha(colors.blue13, 0.75)} horizontal={false} />
                              <XAxis
                                type="number"
                                tick={{ fill: colors.gray5, fontSize: 10, fontWeight: 500 }}
                                axisLine={{ stroke: colors.blue13 }}
                                tickLine={false}
                                tickFormatter={(value) => formatNumber(Number(value || 0))}
                              />
                              <YAxis
                                type="category"
                                dataKey="shortName"
                                width={148}
                                tick={{ fill: colors.blue1, fontSize: 10, fontWeight: 600 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <RechartsTooltip
                                cursor={{ fill: alpha(colors.blue15, 0.45) }}
                                content={({ active, payload }: any) => {
                                  if (!active || !payload?.length) return null;
                                  const row = payload[0]?.payload;
                                  return (
                                    <Paper variant="outlined" sx={{ p: 1, borderColor: colors.blue13, background: colors.white, maxWidth: 280 }}>
                                      <Typography variant="caption" sx={{ color: colors.blue1, fontWeight: 700, textTransform: 'uppercase' }}>
                                        {row?.name}
                                      </Typography>
                                      <Typography variant="body2" sx={{ color: colors.gray3, fontWeight: 600 }}>
                                        Total: {formatNumber(Number(row?.total || 0))} HH
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: colors.gray4, fontWeight: 500, display: 'block' }}>
                                        Directas {formatNumber(Number(row?.directas || 0))} · {weeklySecondarySeriesLabel} {formatNumber(Number(row?.secondary || 0))}
                                      </Typography>
                                      {hasDailyReportWeeklySummary ? (
                                        <Typography variant="caption" sx={{ color: colors.gray5, fontWeight: 500, display: 'block' }}>
                                          {Number(row?.reports || 0)} reporte(s)
                                        </Typography>
                                      ) : null}
                                    </Paper>
                                  );
                                }}
                              />
                              <Bar dataKey="directas" stackId="hh" fill={colors.blue6} radius={[5, 0, 0, 5]} />
                              <Bar dataKey="secondary" stackId="hh" fill={colors.gold3} radius={[0, 5, 5, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Box>
                      ) : (
                        <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', color: colors.gray5, fontWeight: 500 }}>
                          Sin frentes para graficar.
                        </Box>
                      )}
                    </Stack>
                  </Paper>
                </Box>
              </Paper>
              <Dialog
                open={hhMatrixDialogOpen}
                onClose={() => setHhMatrixDialogOpen(false)}
                maxWidth={false}
                fullWidth
                PaperProps={{
                  sx: {
                    width: '98vw',
                    maxWidth: '98vw',
                    height: '95vh',
                    maxHeight: '95vh',
                  }
                }}
              >
                <DialogTitle sx={{ fontWeight: 700, color: colors.slate900, pb: 1 }}>
                  Matriz HH por especialidad, cargo y frente
                </DialogTitle>
                <DialogContent
                sx={{
                  p: 0,
                  overflow: 'hidden',
                  background: colors.white,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  sx={{
                    px: { xs: 1.25, md: 1.5 },
                    py: 1.25,
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: 1,
                    alignItems: 'center',
                    borderBottom: `1px solid ${colors.gray200}`,
                    background: colors.slate50,
                  }}
                >
                  <Box>
                    <Typography variant="caption" sx={{ color: colors.slate500, fontWeight: 700 }}>
                      {hhMatrixRange.start && hhMatrixRange.end
                        ? `${formatDate(hhMatrixRange.start)} - ${formatDate(hhMatrixRange.end)} · ${hhMatrixWeeks.length} semana${hhMatrixWeeks.length === 1 ? '' : 's'}`
                        : 'Seleccione un rango para visualizar'}
                    </Typography>
                  </Box>
                  <Stack
                    direction={{ xs: 'column', lg: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'stretch', lg: 'center' }}
                    justifyContent="flex-start"
                    useFlexGap
                    flexWrap={{ xs: 'wrap', lg: 'nowrap' }}
                    sx={{ width: '100%' }}
                  >
                    <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 300 }, flexShrink: 0 }}>
                      <InputLabel id="hh-matrix-front-filter-label">Frente</InputLabel>
                      <AppSelectControl
                        labelId="hh-matrix-front-filter-label"
                        label="Frente"
                        value={hhMatrixFrontFilter}
                        onChange={(event) => {
                          const nextFront = String(event.target.value || '');
                          setHhMatrixFrontFilter(nextFront);
                          setHhMatrixNonBaseFrontFilter('');

                          if (nextFront === HH_MATRIX_NON_BASE_ALL_TIME) {
                            const availableDates = hhAvailableDates
                              .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
                              .slice()
                              .sort();

                            if (availableDates.length > 0) {
                              hhMatrixManualRangeChangeRef.current = true;
                              hhMatrixRangeHydratedFromSummaryRef.current = false;
                              setHhMatrixStartDate(availableDates[0]);
                              setHhMatrixEndDate(availableDates[availableDates.length - 1]);
                            }
                          }
                        }}
                      >
                        <MenuItem value="">Todos los frentes</MenuItem>
                        <MenuItem value={HH_MATRIX_NON_BASE_ALL_TIME}>
                          OTROS FRENTES · ACUMULADO GLOBAL
                        </MenuItem>
                        {hhMatrixFrontOptions.map((front) => (
                          <MenuItem key={front} value={front}>{front}</MenuItem>
                        ))}
                      </AppSelectControl>
                    </FormControl>

                    {hhMatrixFrontFilter === HH_MATRIX_NON_BASE_ALL_TIME ? (
                      <FormControl
                        size="small"
                        sx={{ minWidth: { xs: '100%', lg: 260 }, maxWidth: { lg: 260 }, flexShrink: 0 }}
                      >
                        <InputLabel id="hh-matrix-non-base-front-filter-label">
                          Frente global
                        </InputLabel>
                        <AppSelectControl
                          labelId="hh-matrix-non-base-front-filter-label"
                          label="Frente global"
                          value={hhMatrixNonBaseFrontFilter}
                          onChange={(event) => {
                            setHhMatrixNonBaseFrontFilter(String(event.target.value || ''));
                          }}
                        >
                          <MenuItem value="">Todos los otros frentes</MenuItem>
                          {hhMatrixNonBaseFrontOptions.map((front) => (
                            <MenuItem key={front} value={front}>
                              {front}
                            </MenuItem>
                          ))}
                        </AppSelectControl>
                      </FormControl>
                    ) : null}

                    <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 220 }, flexShrink: 0 }}>
                      <InputLabel id="hh-matrix-specialty-filter-label">Especialidad</InputLabel>
                      <AppSelectControl
                        labelId="hh-matrix-specialty-filter-label"
                        label="Especialidad"
                        value={hhMatrixSpecialtyFilter}
                        onChange={(event) => setHhMatrixSpecialtyFilter(String(event.target.value || ''))}
                      >
                        <MenuItem value="">Todas las especialidades</MenuItem>
                        {hhMatrixSpecialtyOptions.map((specialty) => (
                          <MenuItem key={specialty} value={specialty}>{specialty}</MenuItem>
                        ))}
                      </AppSelectControl>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: { xs: '100%', lg: 260 }, flexShrink: 0 }}>
                      <InputLabel id="hh-matrix-position-filter-label">Cargo</InputLabel>
                      <AppSelectControl
                        labelId="hh-matrix-position-filter-label"
                        label="Cargo"
                        value={hhMatrixPositionFilter}
                        onChange={(event) => setHhMatrixPositionFilter(String(event.target.value || ''))}
                      >
                        <MenuItem value="">Todos los cargos</MenuItem>
                        {hhMatrixPositionOptions.map((position) => (
                          <MenuItem key={position} value={position}>{position}</MenuItem>
                        ))}
                      </AppSelectControl>
                    </FormControl>

                    <AppTextField
                      label="Rango"
                      size="small"
                      value={
                        hhMatrixRange.start && hhMatrixRange.end
                          ? `${formatSpanishShortDate(hhMatrixRange.start)} - ${formatSpanishShortDate(hhMatrixRange.end)}`
                          : ''
                      }
                      onClick={(event) => {
                        setHhMatrixTempStartDate(parseDateFromIso(hhMatrixRange.start));
                        setHhMatrixTempEndDate(parseDateFromIso(hhMatrixRange.end));
                        setHhMatrixRangeAnchorEl(event.currentTarget);
                      }}
                      InputLabelProps={{ shrink: true }}
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <InputAdornment position="end">
                            <CalendarMonth sx={{ color: colors.slate500, fontSize: 20 }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        width: { xs: '100%', lg: 300 },
                        minWidth: { xs: '100%', lg: 300 },
                        maxWidth: { lg: 300 },
                        flexShrink: 0,
                        cursor: 'pointer',
                        '& .MuiInputBase-input': { cursor: 'pointer' },
                      }}
                    />
                    <Popover
                      open={Boolean(hhMatrixRangeAnchorEl)}
                      anchorEl={hhMatrixRangeAnchorEl}
                      onClose={() => setHhMatrixRangeAnchorEl(null)}
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    >
                      <Box sx={{ p: 1 }}>
                        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                          <DateCalendar
                            value={hhMatrixTempEndDate || hhMatrixTempStartDate}
                            onChange={(nextDate) => {
                              if (!nextDate) return;
                              if (!hhMatrixTempStartDate || (hhMatrixTempStartDate && hhMatrixTempEndDate)) {
                                setHhMatrixTempStartDate(nextDate);
                                setHhMatrixTempEndDate(null);
                                return;
                              }
                              if (nextDate < hhMatrixTempStartDate) {
                                setHhMatrixTempStartDate(nextDate);
                                setHhMatrixTempEndDate(hhMatrixTempStartDate);
                              } else {
                                setHhMatrixTempEndDate(nextDate);
                              }
                            }}
                            slots={{ day: HhMatrixRangeDay }}
                            sx={{
                              width: 340,
                              maxWidth: '100%',
                              '& .MuiPickersCalendarHeader-root': { px: 1, mb: 0.25 },
                              '& .MuiDayCalendar-weekContainer': { my: 0.1 },
                              '& .MuiPickersSlideTransition-root': { minHeight: 210 },
                            }}
                          />
                        </LocalizationProvider>
                        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 1, pb: 1 }}>
                          <AppButton size="small" onClick={() => setHhMatrixRangeAnchorEl(null)}>
                            Cancelar
                          </AppButton>
                          <AppButton
                            size="small"
                            variant="contained"
                            onClick={() => {
                              const start = formatIsoFromDate(hhMatrixTempStartDate);
                              const end = formatIsoFromDate(hhMatrixTempEndDate || hhMatrixTempStartDate);
                              if (start && end) {
                                hhMatrixManualRangeChangeRef.current = true;
                                setHhMatrixStartDate(start <= end ? start : end);
                                setHhMatrixEndDate(start <= end ? end : start);
                              }
                              setHhMatrixRangeAnchorEl(null);
                            }}
                          >
                            Aplicar
                          </AppButton>
                        </Stack>
                      </Box>
                    </Popover>
                  </Stack>
                </Box>

                <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <Table
                    size="small"
                    stickyHeader
                    sx={{
                      minWidth: Math.max(1060, 712 + hhMatrixWeeks.length * 118),
                      '& th, & td': {
                        borderRight: `1px solid ${colors.gray200}`,
                        borderBottom: `1px solid ${colors.gray200}`,
                        whiteSpace: 'nowrap',
                      },
                      '& th:last-of-type, & td:last-of-type': { borderRight: 0 },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, background: colors.slate200, minWidth: 190, left: 0, position: 'sticky', zIndex: 4 }}>
                          {hhMatrixSortLabel('Especialidad', 'specialty')}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, background: colors.slate200, minWidth: 190 }}>
                          {hhMatrixSortLabel('Cargo', 'position')}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, background: colors.slate200, minWidth: 190 }}>
                          {hhMatrixSortLabel('Frente', 'front')}
                        </TableCell>
                        {hhMatrixWeeks.map((week) => (
                          <TableCell key={week.key} align="right" sx={{ fontWeight: 700, background: colors.slate200, minWidth: 118 }}>
                            {hhMatrixSortLabel(<Box sx={{ display: 'grid', lineHeight: 1.1 }}>
                              <span>{week.label}</span>
                              <span style={{ fontSize: 11, color: colors.slate500, fontWeight: 700 }}>
                                {week.start.slice(5)} - {week.end.slice(5)}
                              </span>
                            </Box>, `week:${week.key}`)}
                          </TableCell>
                        ))}
                        <TableCell align="center" sx={{ fontWeight: 700, background: colors.blue100, minWidth: 82 }}>
                          {hhMatrixSortLabel('Directos', 'peopleRows')}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.blue100, minWidth: 92 }}>
                          {hhMatrixSortLabel('HH', 'hh')}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.blue100, minWidth: 92 }}>
                          {hhMatrixSortLabel('HH Extras', 'hhExtras')}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.blue100, minWidth: 116 }}>
                          {hhMatrixSortLabel('HH Rep. Diario', 'dailyReportHh')}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.blue200, minWidth: 96 }}>
                          {hhMatrixSortLabel('Total HH', 'totalHh')}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, background: colors.blue100, minWidth: 82 }}>
                          {hhMatrixSortLabel('Reportes', 'reports')}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredHhMatrixRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9 + hhMatrixWeeks.length} sx={{ py: 3, color: colors.slate500, textAlign: 'center' }}>
                            {hhMatrixRows.length === 0
                              ? 'No hay HH en el rango seleccionado.'
                              : 'No hay resultados para los filtros seleccionados.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedHhMatrixRows.map((row) => {
                          const rowTotal = Number(row.hh || 0) + Number(row.hhExtras || 0);
                          return (
                            <TableRow key={row.key} hover>
                              <TableCell sx={{ fontWeight: 700, background: colors.white, position: 'sticky', left: 0, zIndex: 2 }}>
                                {row.specialty}
                              </TableCell>
                              <TableCell>{row.position}</TableCell>
                              <TableCell>{row.front}</TableCell>
                              {hhMatrixWeeks.map((week) => (
                                <TableCell key={`${row.key}-${week.key}`} align="right" sx={{ fontWeight: row.byWeek[week.key] ? 800 : 400 }}>
                                  {row.byWeek[week.key] ? formatNumber(row.byWeek[week.key]) : '-'}
                                </TableCell>
                              ))}
                              <TableCell align="center">{row.peopleRows}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>{formatNumber(row.hh)}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>{formatNumber(row.hhExtras)}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>{formatNumber(row.dailyReportHh || 0)}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, background: colors.blue50 }}>{formatNumber(rowTotal)}</TableCell>
                              <TableCell align="center">{row.reports}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                      {filteredHhMatrixRows.length > 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white, textAlign: 'right' }}>
                            TOTAL
                          </TableCell>
                          {hhMatrixWeeks.map((week) => (
                            <TableCell key={`total-${week.key}`} align="right" sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white }}>
                              {formatNumber(hhMatrixTotalsByWeek[week.key] || 0)}
                            </TableCell>
                          ))}
                          <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white }}>
                            {filteredHhMatrixRows.reduce((acc, row) => acc + row.peopleRows, 0)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white }}>
                            {formatNumber(filteredHhMatrixRows.reduce((acc, row) => acc + row.hh, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white }}>
                            {formatNumber(filteredHhMatrixRows.reduce((acc, row) => acc + row.hhExtras, 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white }}>
                            {formatNumber(filteredHhMatrixRows.reduce((acc, row) => acc + Number(row.dailyReportHh || 0), 0))}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white }}>
                            {formatNumber(hhMatrixGrandTotal)}
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHeadDark, color: colors.white }}>
                            -
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TableContainer>
                </DialogContent>
                <DialogActions sx={{ borderTop: `1px solid ${colors.gray200}`, px: 2, py: 1 }}>
                  <AppButton onClick={() => setHhMatrixDialogOpen(false)} variant="outlined">
                    Cerrar
                  </AppButton>
                </DialogActions>
              </Dialog>

              {error ? (
                <AppAlert severity="error">{error}</AppAlert>
              ) : loading ? (
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
                  <CircularProgress size={22} />
                  <Typography sx={{ color: colors.gray600 }}>Cargando reportes...</Typography>
                </Stack>
              ) : (
                <Stack spacing={{ xs: 1, md: 1.25 }}>
                  {dashboardByDay.length === 0 ? (
                    <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', borderColor: colors.managementBorder }}>
                      <Typography sx={{ color: colors.slate500 }}>No hay HH directas declaradas para mostrar.</Typography>
                    </Paper>
                  ) : (
                    dashboardByDay.map((day) => (
                      <Accordion
                        key={day.date}
                        disableGutters
                        sx={{
                          border: `1px solid ${colors.managementBorder}`,
                          borderRadius: 2,
                          overflow: 'hidden',
                          background: colors.white,
                          boxShadow: 'none',
                          '&:before': { display: 'none' },
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMore sx={{ color: colors.white }} />}
                          sx={{
                            background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue2} 100%)`,
                            color: colors.white,
                            minHeight: { xs: 52, md: 56 },
                            px: { xs: 1.25, md: 2 },
                            '& .MuiAccordionSummary-content': {
                              my: { xs: 0.75, md: 1 },
                            },
                          }}
                        >
                          <Stack
                            direction={{ xs: 'column', md: 'row' }}
                            spacing={1}
                            justifyContent="space-between"
                            alignItems={{ xs: 'flex-start', md: 'center' }}
                            sx={{ width: '100%' }}
                          >
                            <Typography variant="h6" sx={{ fontWeight: 700, color: colors.white, fontSize: { xs: '1.15rem', md: '1.25rem' } }}>
                              {formatDate(day.date)}
                            </Typography>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              <Typography sx={{ fontWeight: 700, color: colors.white }}>
                                HH Directas Rep. Diario: {formatNumber(day.dailyReportDirectHh || 0)}
                              </Typography>
                              <Typography sx={{ color: colors.blue100 }}>
                                HH Terreno: {formatNumber(day.hh)}
                              </Typography>
                              <Typography sx={{ color: colors.blue100 }}>
                                HH Extras Terreno: {formatNumber(day.hhExtras)}
                              </Typography>
                              <Typography sx={{ color: colors.blue100 }}>
                                Directos: {day.peopleRows}
                              </Typography>
                              <Typography sx={{ color: colors.blue100 }}>
                                Reportes: {day.reports}
                              </Typography>
                              <Typography sx={{ color: colors.blue100 }}>
                                Indirectos Turno: {day.indirectTurnoTotal}
                              </Typography>
                              <Typography sx={{ color: colors.blue100 }}>
                                HH Indirectos: {formatNumber(day.indirectTurnoHhTotal || 0)}
                              </Typography>
                            </Stack>
                          </Stack>
                        </AccordionSummary>

                        <AccordionDetails
                          sx={{
                            p: 0,
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' },
                            gap: { xs: 0.75, lg: 0 },
                          }}
                        >
                          <Box sx={{ p: { xs: 1, md: 1.25 }, borderRight: { lg: `1px solid ${colors.gray200}` }, display: 'grid', gap: 1, alignContent: 'start' }}>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.gray900, mb: 1 }}>
                              Horas por especialidad
                            </Typography>
                            <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1 }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Especialidad</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Directos</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Extras</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {day.bySpecialty.map((item) => (
                                    <TableRow key={item.label}>
                                      <TableCell sx={{ py: 0.45, px: 1 }}>{item.label}</TableCell>
                                      <TableCell align="center" sx={{ py: 0.45, px: 1 }}>{item.peopleRows}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(item.hh)}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(item.hhExtras)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>

                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.gray900, mb: 1 }}>
                              Horas por frente
                            </Typography>
                            <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1 }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Frente</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Directos</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Extras</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Rep. Diario</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {day.byFront.map((item) => {
                                    const specialtyGroups = day.byFrontSpecialty.find((row) => row.front === item.label)?.specialties || [];
                                    return (
                                      <React.Fragment key={item.label}>
                                        <TableRow>
                                          <TableCell sx={{ py: 0.45, px: 1, fontWeight: 700 }}>{item.label}</TableCell>
                                          <TableCell align="center" sx={{ py: 0.45, px: 1 }}>{item.peopleRows}</TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(item.hh)}</TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(item.hhExtras)}</TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1, background: colors.yellow50 }}>
                                            {Number(item.dailyReportDirectHh || 0) > 0 ? formatNumber(item.dailyReportDirectHh || 0) : '-'}
                                          </TableCell>
                                        </TableRow>
                                        {specialtyGroups.map((specialty) => (
                                          <React.Fragment key={`${item.label}-${specialty.label}`}>
                                            <TableRow sx={{ background: colors.slate50 }}>
                                              <TableCell sx={{ py: 0.4, px: 1, pl: 3, color: colors.slate600 }}>
                                                - {specialty.label}
                                              </TableCell>
                                              <TableCell align="center" sx={{ py: 0.4, px: 1, color: colors.slate600 }}>
                                                {specialty.peopleRows}
                                              </TableCell>
                                              <TableCell align="right" sx={{ py: 0.4, px: 1, color: colors.slate600 }}>
                                                {formatNumber(specialty.hh)}
                                              </TableCell>
                                              <TableCell align="right" sx={{ py: 0.4, px: 1, color: colors.slate600 }}>
                                                {formatNumber(specialty.hhExtras)}
                                              </TableCell>
                                              <TableCell align="right" sx={{ py: 0.4, px: 1, color: colors.slate600, background: colors.yellow50 }}>
                                                {Number(specialty.dailyReportDirectHh || 0) > 0 ? formatNumber(specialty.dailyReportDirectHh || 0) : '-'}
                                              </TableCell>
                                            </TableRow>
                                          </React.Fragment>
                                        ))}
                                      </React.Fragment>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>

                          </Box>

                          <Box sx={{ p: { xs: 1, md: 1.25 }, borderRight: { lg: `1px solid ${colors.gray200}` } }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.gray900, mb: 1 }}>
                              Agrupado por cargo
                            </Typography>
                            <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1 }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Cargo</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Directos</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Extras</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {day.byPosition.map((item) => (
                                    <TableRow key={item.label}>
                                      <TableCell sx={{ py: 0.45, px: 1 }}>{item.label}</TableCell>
                                      <TableCell align="center" sx={{ py: 0.45, px: 1 }}>{item.peopleRows}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(item.hh)}</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(item.hhExtras)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>

                          <Box sx={{ p: { xs: 1, md: 1.25 } }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.gray900, mb: 1 }}>
                              Indirectos en Turno
                            </Typography>
                            <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1 }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Cargo</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Indirectos</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {day.indirectTurnoByPosition.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={3} sx={{ color: colors.slate500, fontStyle: 'italic', py: 0.45, px: 1 }}>
                                        Sin indirectos en Turno para esta fecha.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    <>
                                      {day.indirectTurnoByPosition.map((item) => (
                                        <TableRow key={item.label}>
                                          <TableCell sx={{ py: 0.45, px: 1 }}>{item.label}</TableCell>
                                          <TableCell align="center" sx={{ py: 0.45, px: 1 }}>{item.peopleRows}</TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(item.hh)}</TableCell>
                                        </TableRow>
                                      ))}
                                      <TableRow>
                                        <TableCell sx={{ py: 0.55, px: 1, fontWeight: 700, background: colors.managementTableHead }}>TOTAL</TableCell>
                                        <TableCell align="center" sx={{ py: 0.55, px: 1, fontWeight: 700, background: colors.managementTableHead }}>
                                          {day.indirectTurnoTotal}
                                        </TableCell>
                                        <TableCell align="right" sx={{ py: 0.55, px: 1, fontWeight: 700, background: colors.managementTableHead }}>
                                          {formatNumber(day.indirectTurnoHhTotal || 0)}
                                        </TableCell>
                                      </TableRow>
                                    </>
                                  )}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    ))
                  )}
                </Stack>
              )}
              </>
              ) : activeTab === 'hh-history' ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.25, md: 1.75 },
                    borderColor: colors.managementBorder,
                    background: colors.white,
                  }}
                >
                  {historicalHhError ? (
                    <AppAlert severity="error">{historicalHhError}</AppAlert>
                  ) : historicalHhLoading ? (
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3 }}>
                      <CircularProgress size={22} />
                      <Typography sx={{ color: colors.gray600 }}>Cargando HH histórico...</Typography>
                    </Stack>
                  ) : historicalHhByFront.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: 'center' }}>
                      <Typography sx={{ color: colors.slate500 }}>No hay HH histórico cargado.</Typography>
                    </Box>
                  ) : (
                    <Stack spacing={{ xs: 1, md: 1.25 }}>
                      {historicalHhByFront.map((frontGroup) => {
                        const lastRow = frontGroup.rows[frontGroup.rows.length - 1];
                        return (
                          <Accordion
                            key={frontGroup.front}
                            defaultExpanded={false}
                            disableGutters
                            sx={{
                              border: `1px solid ${colors.managementBorder}`,
                              borderRadius: 2,
                              overflow: 'hidden',
                              background: colors.white,
                              boxShadow: 'none',
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary
                              expandIcon={<ExpandMore sx={{ color: colors.white }} />}
                              sx={{
                                background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue2} 100%)`,
                                color: colors.white,
                                minHeight: { xs: 52, md: 56 },
                                px: { xs: 1.25, md: 2 },
                                '& .MuiAccordionSummary-content': { my: { xs: 0.75, md: 1 } },
                              }}
                            >
                              <Stack
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={1}
                                justifyContent="space-between"
                                alignItems={{ xs: 'flex-start', md: 'center' }}
                                sx={{ width: '100%' }}
                              >
                                <Typography variant="h6" sx={{ fontWeight: 700, color: colors.white, fontSize: { xs: '1.1rem', md: '1.25rem' } }}>
                                  {frontGroup.front}
                                </Typography>
                                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                                  <Typography sx={{ fontWeight: 700, color: colors.white }}>
                                    Reportes: {frontGroup.rows.length}
                                  </Typography>
                                  <Typography sx={{ color: colors.blue100 }}>
                                    HH acum: {formatNumber(toNumber(lastRow?.total_hh_accum))}
                                  </Typography>
                                  <Typography sx={{ color: colors.blue100 }}>
                                    HM acum: {formatNumber(toNumber(lastRow?.major_hm_accum) + toNumber(lastRow?.minor_hm_accum))}
                                  </Typography>
                                  <AppButton
                                    size="small"
                                    variant="outlined"
                                    startIcon={historicalHhExportingFront === frontGroup.front ? <CircularProgress size={14} sx={{ color: colors.white }} /> : <FileUpload />}
                                    disabled={historicalHhExportingFront === frontGroup.front}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void exportHistoricalHhFront(frontGroup);
                                    }}
                                    onFocus={(event) => event.stopPropagation()}
                                    sx={{
                                      ml: { xs: 0, md: 1 },
                                      color: colors.white,
                                      borderColor: alpha(colors.white, 0.65),
                                      fontWeight: 700,
                                      textTransform: 'none',
                                      '&:hover': {
                                        borderColor: colors.white,
                                        background: alpha(colors.white, 0.12),
                                      },
                                    }}
                                  >
                                    Excel
                                  </AppButton>
                                </Stack>
                              </Stack>
                            </AccordionSummary>
                            <AccordionDetails sx={{ p: { xs: 1, md: 1.25 } }}>
                              <Box
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 360px' },
                                  gap: { xs: 1, md: 1.25 },
                                  alignItems: 'start',
                                }}
                              >
                                <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1, overflowX: 'auto' }}>
                                  <Table size="small" sx={{ minWidth: 1180 }}>
                                    <TableHead>
                                      <TableRow>
                                        <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Semana</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Fecha</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Daily Report N°</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Indirectas</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Directas</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Diarias</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH I. Acum</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH D. Acum</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Totales Acum</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HM Mayores Diarias</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HM Mayores Acum</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HM Menores y mov Diarias</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HM Menores y mov Acum</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {frontGroup.rows.map((row) => (
                                        <TableRow key={row.id}>
                                          <TableCell align="center" sx={{ py: 0.45, px: 1 }}>{row.week_no || '-'}</TableCell>
                                          <TableCell align="center" sx={{ py: 0.45, px: 1 }}>{formatDate(String(row.report_date || ''))}</TableCell>
                                          <TableCell align="center" sx={{ py: 0.45, px: 1 }}>N°{row.report_no}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.indirect_hh))}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.direct_hh))}</TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(toNumber(row.daily_hh))}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.indirect_hh_accum))}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.direct_hh_accum))}</TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 700, py: 0.45, px: 1 }}>{formatNumber(toNumber(row.total_hh_accum))}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.major_hm_daily))}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.major_hm_accum))}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.minor_hm_daily))}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1 }}>{formatNumber(toNumber(row.minor_hm_accum))}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>

                                <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1 }}>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>Semana</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Ind. Sem.</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HH Dir. Sem.</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead, py: 0.55, px: 1 }}>HM Semanal</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {frontGroup.weekly.map((week) => (
                                        <TableRow key={`${frontGroup.front}-${week.weekNo}`}>
                                          <TableCell align="center" sx={{ py: 0.45, px: 1, fontWeight: 700 }}>{week.weekNo}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1, fontWeight: 700, background: colors.yellow100 }}>{formatNumber(week.indirectHh)}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1, fontWeight: 700, background: colors.yellow100 }}>{formatNumber(week.directHh)}</TableCell>
                                          <TableCell align="right" sx={{ py: 0.45, px: 1, fontWeight: 700, background: colors.yellow100 }}>{formatNumber(week.hm)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Box>
                            </AccordionDetails>
                          </Accordion>
                        );
                      })}
                    </Stack>
                  )}
                </Paper>
              ) : activeTab === 'crew-personnel' ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.5, md: 2 },
                    borderColor: colors.managementBorderStrong,
                    borderTopColor: colors.managementBorderStrong,
                    borderRadius: '0 0 10px 10px',
                    background: colors.white,
                    boxShadow: `0 10px 20px ${alpha(colors.slate900, 0.05)}`,
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1.25}
                      justifyContent="space-between"
                      alignItems={{ xs: 'stretch', md: 'center' }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 700, color: colors.gray900 }}>
                          Personal por frente y cuadrilla
                        </Typography>
                        <Typography sx={{ color: colors.slate500, fontSize: 13 }}>
                          Integrantes declarados en reportes de terreno, separados por frente.
                        </Typography>
                      </Box>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <AppTextField
                          size="small"
                          label="Fecha"
                          placeholder="dd-mm-yyyy"
                          value={crewPersonnelDateFilter ? formatDate(crewPersonnelDateFilter) : ''}
                          onClick={(event) => {
                            if (crewPersonnelDateOptions.length > 0) setCrewPersonnelDateAnchorEl(event.currentTarget);
                          }}
                          InputLabelProps={{ shrink: true }}
                          InputProps={{
                            readOnly: true,
                            endAdornment: (
                              <InputAdornment position="end">
                                <CalendarMonth sx={{ color: colors.gray900, fontSize: 20 }} />
                              </InputAdornment>
                            ),
                          }}
                          helperText={crewPersonnelDateOptions.length === 0 ? 'No hay fechas disponibles' : undefined}
                          sx={{
                            width: { xs: '100%', sm: 190 },
                            cursor: crewPersonnelDateOptions.length > 0 ? 'pointer' : 'default',
                            '& .MuiInputBase-input': { cursor: crewPersonnelDateOptions.length > 0 ? 'pointer' : 'default' },
                          }}
                        />
                        <Popover
                          open={Boolean(crewPersonnelDateAnchorEl)}
                          anchorEl={crewPersonnelDateAnchorEl}
                          onClose={() => setCrewPersonnelDateAnchorEl(null)}
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        >
                          <Box sx={{ p: 1 }}>
                            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                              <DateCalendar
                                value={parseDateKeyToLocalDate(crewPersonnelDateFilter) || parseDateKeyToLocalDate(crewPersonnelDateOptions[0] || '')}
                                onChange={(nextDate) => {
                                  if (!nextDate) return;
                                  const nextKey = dateToKey(nextDate as Date);
                                  if (!crewPersonnelDateSet.has(nextKey)) return;
                                  setCrewPersonnelDateFilter(nextKey);
                                  setCrewPersonnelDateAnchorEl(null);
                                }}
                                shouldDisableDate={(day) => !crewPersonnelDateSet.has(dateToKey(day as Date))}
                                sx={{
                                  width: 340,
                                  maxWidth: '100%',
                                  '& .MuiPickersCalendarHeader-root': { px: 1, mb: 0.25 },
                                  '& .MuiDayCalendar-weekContainer': { my: 0.1 },
                                  '& .MuiPickersSlideTransition-root': { minHeight: 210 },
                                }}
                              />
                            </LocalizationProvider>
                            <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ px: 1, pb: 1 }}>
                              <AppButton
                                size="small"
                                onClick={() => {
                                  setCrewPersonnelDateFilter('');
                                  setCrewPersonnelDateAnchorEl(null);
                                }}
                              >
                                Todas
                              </AppButton>
                              <AppButton size="small" onClick={() => setCrewPersonnelDateAnchorEl(null)}>
                                Cerrar
                              </AppButton>
                            </Stack>
                          </Box>
                        </Popover>
                        <AppTextField
                          select
                          size="small"
                          label="Frente"
                          value={crewPersonnelFrontFilter}
                          onChange={(event) => setCrewPersonnelFrontFilter(event.target.value)}
                          sx={{ width: { xs: '100%', sm: 230 } }}
                        >
                          <MenuItem value="">Todos los frentes</MenuItem>
                          {crewPersonnelFrontOptions.map((front) => (
                            <MenuItem key={`crew-personnel-front-${front}`} value={front}>
                              {front}
                            </MenuItem>
                          ))}
                        </AppTextField>
                        <AppTextField
                          select
                          size="small"
                          label="Tipo"
                          value={crewPersonnelTypeFilter}
                          onChange={(event) => setCrewPersonnelTypeFilter(event.target.value)}
                          sx={{ width: { xs: '100%', sm: 150 } }}
                        >
                          <MenuItem value="">Todos</MenuItem>
                          <MenuItem value="DIRECTO">Directo</MenuItem>
                          <MenuItem value="INDIRECTO">Indirecto</MenuItem>
                        </AppTextField>
                        <AppTextField
                          select
                          size="small"
                          label="HH"
                          value={crewPersonnelHhFilter}
                          onChange={(event) => setCrewPersonnelHhFilter(event.target.value)}
                          sx={{ width: { xs: '100%', sm: 130 } }}
                        >
                          <MenuItem value="">Todas</MenuItem>
                          {crewPersonnelHhOptions.map((option) => (
                            <MenuItem key={`crew-personnel-hh-${option.key}`} value={option.key}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </AppTextField>
                        <AppTextField
                          select
                          size="small"
                          label="HH extras"
                          value={crewPersonnelExtraHhFilter}
                          onChange={(event) => setCrewPersonnelExtraHhFilter(event.target.value)}
                          sx={{ width: { xs: '100%', sm: 150 } }}
                        >
                          <MenuItem value="">Todas</MenuItem>
                          {crewPersonnelExtraHhOptions.map((option) => (
                            <MenuItem key={`crew-personnel-extra-hh-${option.key}`} value={option.key}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </AppTextField>
                        <AppTextField
                          size="small"
                          label="Buscar personal"
                          placeholder="Nombre, RUT, cargo, frente, reporte..."
                          value={crewPersonnelSearch}
                          onChange={(event) => setCrewPersonnelSearch(event.target.value)}
                          sx={{ width: { xs: '100%', md: 360 } }}
                        />
                        <AppIconButton
                          size="small"
                          disabled={crewPersonnelExporting || filteredCrewPersonnelRows.length === 0}
                          onClick={() => void exportVisibleCrewPersonnelRows()}
                          aria-label="Exportar personal a Excel"
                          title="Exportar a Excel"
                          sx={{
                            width: 44,
                            height: 40,
                            border: `1px solid ${colors.managementActionBlue}`,
                            borderRadius: 1,
                            color: colors.managementActionBlue,
                            bgcolor: colors.blue50,
                            '&:hover': { bgcolor: colors.blue100, borderColor: colors.managementActionBlueDark },
                            '&.Mui-disabled': { borderColor: colors.slate300 },
                          }}
                        >
                          {crewPersonnelExporting ? <CircularProgress size={19} /> : <Download sx={{ fontSize: 26 }} />}
                        </AppIconButton>
                        {crewPersonnelDateFilter || crewPersonnelFrontFilter || crewPersonnelTypeFilter || crewPersonnelHhFilter || crewPersonnelExtraHhFilter || crewPersonnelSearch ? (
                          <AppIconButton
                            size="small"
                            onClick={() => {
                              setCrewPersonnelDateFilter('');
                              setCrewPersonnelFrontFilter('');
                              setCrewPersonnelTypeFilter('');
                              setCrewPersonnelHhFilter('');
                              setCrewPersonnelExtraHhFilter('');
                              setCrewPersonnelSearch('');
                            }}
                            aria-label="Limpiar filtros de personal"
                            title="Limpiar filtros"
                            sx={{ border: `1px solid ${colors.slate300}`, borderRadius: 1, alignSelf: { xs: 'flex-end', sm: 'center' } }}
                          >
                            <Clear sx={{ fontSize: 18 }} />
                          </AppIconButton>
                        ) : null}
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        display: 'grid',
                        gap: 1,
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                      }}
                    >
                      <Paper variant="outlined" sx={{ p: 1.15, borderColor: colors.gray200 }}>
                        <Typography variant="caption" sx={{ color: colors.slate500, fontWeight: 700 }}>Personas</Typography>
                        <Typography sx={{ color: colors.blue1, fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>
                          {crewPersonnelStats.people}
                        </Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 1.15, borderColor: colors.gray200 }}>
                        <Typography variant="caption" sx={{ color: colors.slate500, fontWeight: 700 }}>Frentes</Typography>
                        <Typography sx={{ color: colors.blue1, fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>
                          {crewPersonnelStats.fronts}
                        </Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 1.15, borderColor: colors.gray200 }}>
                        <Typography variant="caption" sx={{ color: colors.slate500, fontWeight: 700 }}>HH</Typography>
                        <Typography sx={{ color: colors.blue1, fontWeight: 700, fontSize: 24, lineHeight: 1.1 }}>
                          {formatNumber(crewPersonnelStats.hh)}
                        </Typography>
                      </Paper>
                    </Box>

                    <Typography sx={{ color: colors.slate500, fontSize: 13 }}>
                      Mostrando {filteredCrewPersonnelRows.length} de {crewPersonnelRows.length} registros.
                    </Typography>

                    {error ? (
                      <AppAlert severity="error">{error}</AppAlert>
                    ) : loading ? (
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={22} />
                        <Typography sx={{ color: colors.gray600 }}>Cargando personal...</Typography>
                      </Stack>
                    ) : filteredCrewPersonnelRows.length === 0 ? (
                      <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography sx={{ color: colors.slate500 }}>
                          No hay integrantes que coincidan con la búsqueda.
                        </Typography>
                      </Box>
                    ) : (
                      <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <Table
                          size="small"
                          sx={{
                            minWidth: 1420,
                            '& th, & td': {
                              whiteSpace: 'nowrap',
                              lineHeight: 1.2,
                            },
                          }}
                        >
                          <TableHead>
                            <TableRow>
                              <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 120 }}>Fecha</TableCell>
                              <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 250 }}>Frente</TableCell>
                              <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 330 }}>Nombre</TableCell>
                              <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 230 }}>Cargo</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 130 }}>Tipo</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 150 }}>RUT</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 90 }}>HH</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 110 }}>HH extras</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead, minWidth: 110 }}>Reporte</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filteredCrewPersonnelRows.map((row) => (
                              <TableRow key={row.key}>
                                <TableCell align="center" sx={{ py: 0.65, minWidth: 120 }}>{formatDate(row.date)}</TableCell>
                                <TableCell sx={{ py: 0.65, minWidth: 250, fontWeight: 700 }}>{row.front || '-'}</TableCell>
                                <TableCell sx={{ py: 0.65, minWidth: 330, fontWeight: 700 }}>{row.name || '-'}</TableCell>
                                <TableCell sx={{ py: 0.65, minWidth: 230 }}>{row.position || '-'}</TableCell>
                                <TableCell align="center" sx={{ py: 0.65, minWidth: 130 }}>{row.workerType || '-'}</TableCell>
                                <TableCell align="center" sx={{ py: 0.65, minWidth: 150 }}>{formatChileanRut(row.rut)}</TableCell>
                                <TableCell align="center" sx={{ py: 0.65, minWidth: 90, fontWeight: 700 }}>{formatNumber(row.hh)}</TableCell>
                                <TableCell align="center" sx={{ py: 0.65, minWidth: 110 }}>{formatNumber(row.hhExtras)}</TableCell>
                                <TableCell align="center" sx={{ py: 0.65, minWidth: 110 }}>
                                  {row.reportNo ? `N°${row.reportNo}` : row.reportId.slice(0, 8)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Stack>
                </Paper>
              ) : activeTab === 'activities' ? (
                <>
                <AppWeekNavigator
                  periodLabel={activitiesWeekLabel}
                  value={activitiesWeekRange?.start || ''}
                  options={activitiesAvailableWeeks.map((range) => ({
                    value: range.start,
                    shortLabel: `Semana ${getProjectWeekNumber(range.start)}`,
                    label: `Semana ${getProjectWeekNumber(range.start)} (${formatSpanishShortDate(range.start)} - ${formatSpanishShortDate(range.end)})`,
                  }))}
                  previousDisabled={isActivitiesGlobalSearch || !previousActivitiesWeek}
                  nextDisabled={isActivitiesGlobalSearch || !nextActivitiesWeek}
                  latestDisabled={isActivitiesGlobalSearch || isViewingLatestActivitiesWeek}
                  selectDisabled={isActivitiesGlobalSearch}
                  onPrevious={() => previousActivitiesWeek && setActivitiesWeekRange(previousActivitiesWeek)}
                  onNext={() => nextActivitiesWeek && setActivitiesWeekRange(nextActivitiesWeek)}
                  onLatest={() => setActivitiesWeekRange(latestAvailableActivitiesWeek)}
                  onChange={(value) => {
                    const selected = activitiesAvailableWeeks.find((range) => range.start === value);
                    if (selected) setActivitiesWeekRange(selected);
                  }}
                  sx={{ mb: { xs: 1, md: 1.25 }, borderColor: colors.managementBorder }}
                />
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.5, md: 2 },
                    borderColor: colors.managementBorder,
                    background: colors.white,
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1.25}
                      justifyContent="space-between"
                      alignItems={{ xs: 'stretch', md: 'center' }}
                    >
                      <Typography sx={{ fontWeight: 700, color: colors.gray900 }}>
                        Actividades de reportes de terreno
                      </Typography>
                      <AppTextField
                        size="small"
                        label="Buscar actividad"
                        placeholder="Nombre, frente, área, cuadrilla, unidad, fecha, reporte..."
                        value={activitiesSearch}
                        onChange={(event) => setActivitiesSearch(event.target.value)}
                        sx={{ width: { xs: '100%', md: 480 } }}
                      />
                    </Stack>
                    <Typography sx={{ color: colors.slate500, fontSize: 13 }}>
                      Mostrando {filteredManagementActivities.length} de {managementActivities.length} actividades.
                    </Typography>

                    {error ? (
                      <AppAlert severity="error">{error}</AppAlert>
                    ) : loading ? (
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={22} />
                        <Typography sx={{ color: colors.gray600 }}>Cargando actividades...</Typography>
                      </Stack>
                    ) : filteredManagementActivities.length === 0 ? (
                      <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography sx={{ color: colors.slate500 }}>
                          No hay actividades que coincidan con la búsqueda.
                        </Typography>
                      </Box>
                    ) : isActivitiesCompact ? (
                      <Stack spacing={1}>
                        {filteredManagementActivities.map((row, rowIndex) => {
                          const reportLabel = row.reportNo ? `N°${row.reportNo}` : row.reportId.slice(0, 8);
                          const dateLabel = formatDate(row.date);
                          const quantityLabel = formatNumber(row.quantity);
                          return (
                            <Box
                              key={`${row.reportId}-${row.sourceIndex}-${row.name}`}
                              sx={{
                                border: `1px solid ${colors.gray200}`,
                                borderRadius: 1,
                                px: 1,
                                py: 0.85,
                                display: 'grid',
                                gap: 0.6,
                                background: rowIndex % 2 === 0 ? colors.managementPanelBgSoft : colors.managementPanelBgAlt,
                              }}
                            >
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.slate700, flexShrink: 0 }}>
                                  <Box component="span" sx={{ fontWeight: 700, color: colors.slate500 }}>Fecha: </Box>
                                  {dateLabel}
                                </Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.blue700, flexShrink: 0, textAlign: 'center' }}>
                                  <Box component="span" sx={{ fontWeight: 700, color: colors.slate500 }}>Reporte: </Box>
                                  {reportLabel}
                                </Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.gray900, flexShrink: 0, textAlign: 'center' }}>
                                  <Box component="span" sx={{ fontWeight: 700, color: colors.slate500 }}>Cantidad: </Box>
                                  {quantityLabel} {row.unit || ''}
                                </Typography>
                              </Stack>
                              <Typography
                                title={row.name || ''}
                                sx={{
                                  minWidth: 0,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: colors.gray900,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {row.name || '-'}
                              </Typography>
                              <Box
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                                  columnGap: 1,
                                  rowGap: 0.35,
                                }}
                              >
                                {[
                                  ['Frente', row.front || '-'],
                                  ['Área', row.area || '-'],
                                  ['Cuadrilla', row.crew || '-'],
                                  ['Especialidad', row.specialty || '-'],
                                ].map(([label, value]) => (
                                  <Typography
                                    key={`${row.reportId}-${row.sourceIndex}-${label}`}
                                    title={value}
                                    sx={{
                                      minWidth: 0,
                                      fontSize: 12,
                                      color: colors.slate600,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <Box component="span" sx={{ fontWeight: 700, color: colors.slate500 }}>{label}: </Box>
                                    {value}
                                  </Typography>
                                ))}
                              </Box>
                            </Box>
                          );
                        })}
                      </Stack>
                    ) : (
                      <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1, overflowX: 'hidden' }}>
                        <Table
                          size="small"
                          sx={{
                            width: '100%',
                            tableLayout: 'fixed',
                            '& th, & td': {
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              px: 0.75,
                            },
                            '& th': {
                              textAlign: 'center',
                            },
                          }}
                        >
                          <colgroup>
                            <col style={{ width: 92 }} />
                            <col style={{ width: 72 }} />
                            <col style={{ width: '30%' }} />
                            <col style={{ width: 82 }} />
                            <col style={{ width: 72 }} />
                            <col style={{ width: '15%' }} />
                            <col style={{ width: '10%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '9%' }} />
                          </colgroup>
                          <TableHead>
                            <TableRow>
                              <TableCell title="Fecha" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white, overflow: 'visible', textOverflow: 'clip' }}>Fecha</TableCell>
                              <TableCell title="Reporte" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white, overflow: 'visible', textOverflow: 'clip' }}>Reporte</TableCell>
                              <TableCell title="Actividad" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white }}>Actividad</TableCell>
                              <TableCell title="Cantidad" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white, overflow: 'visible', textOverflow: 'clip' }}>Cantidad</TableCell>
                              <TableCell title="Unidad" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white, overflow: 'visible', textOverflow: 'clip' }}>Unidad</TableCell>
                              <TableCell title="Frente" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white }}>Frente</TableCell>
                              <TableCell title="Área" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white }}>Área</TableCell>
                              <TableCell title="Cuadrilla" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white }}>Cuadrilla</TableCell>
                              <TableCell title="Especialidad" align="center" sx={{ fontWeight: 600, background: colors.blue2, color: colors.white }}>Especialidad</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filteredManagementActivities.map((row, rowIndex) => {
                              const reportLabel = row.reportNo ? `N°${row.reportNo}` : row.reportId.slice(0, 8);
                              const dateLabel = formatDate(row.date);
                              const quantityLabel = formatNumber(row.quantity);
                              return (
                                <TableRow
                                  key={`${row.reportId}-${row.sourceIndex}-${row.name}`}
                                  sx={{
                                    bgcolor: rowIndex % 2 === 0 ? colors.managementPanelBgSoft : colors.managementPanelBgAlt,
                                    '&:hover': { bgcolor: colors.managementPanelHover },
                                  }}
                                >
                                  <TableCell title={dateLabel} sx={{ py: 0.55, overflow: 'visible', textOverflow: 'clip' }}>{dateLabel}</TableCell>
                                  <TableCell title={reportLabel} align="center" sx={{ py: 0.55, overflow: 'visible', textOverflow: 'clip' }}>{reportLabel}</TableCell>
                                  <TableCell title={row.name || ''} sx={{ py: 0.65, fontWeight: 600 }}>{row.name}</TableCell>
                                  <TableCell title={quantityLabel} align="center" sx={{ py: 0.55, overflow: 'visible', textOverflow: 'clip' }}>{quantityLabel}</TableCell>
                                  <TableCell title={row.unit || '-'} align="center" sx={{ py: 0.55, overflow: 'visible', textOverflow: 'clip' }}>{row.unit || '-'}</TableCell>
                                  <TableCell title={row.front || '-'} sx={{ py: 0.65 }}>{row.front || '-'}</TableCell>
                                  <TableCell title={row.area || '-'} sx={{ py: 0.65 }}>{row.area || '-'}</TableCell>
                                  <TableCell title={row.crew || '-'} sx={{ py: 0.65 }}>{row.crew || '-'}</TableCell>
                                  <TableCell title={row.specialty || '-'} sx={{ py: 0.65 }}>{row.specialty || '-'}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Stack>
                </Paper>
                </>
              ) : activeTab === 'report-fronts' ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.25, md: 1.75 },
                    borderColor: colors.managementBorderSoft,
                    borderRadius: 2,
                    boxShadow: `0 8px 20px ${alpha(colors.slate900, 0.04)}`,
                    background: colors.white,
                  }}
                >
                  <Stack spacing={1.25}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                      <Box>
                        <Typography sx={{ fontWeight: 700, color: colors.gray900, fontSize: 18 }}>
                          Frentes y UDR
                        </Typography>
                        <Typography sx={{ color: colors.slate500, fontSize: 13 }}>
                          Catálogo usado por los reportes de uso de recursos para armar títulos y correlativos.
                        </Typography>
                      </Box>
                    </Stack>

                    {reportFrontsError ? <AppAlert severity="error">{reportFrontsError}</AppAlert> : null}
                    {reportFrontsLoading ? (
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2 }}>
                        <CircularProgress size={22} />
                        <Typography sx={{ color: colors.gray600 }}>Cargando frentes...</Typography>
                      </Stack>
                    ) : null}

                    <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1, backgroundColor: colors.white, overflowX: 'auto' }}>
                      <Table size="small" sx={{ minWidth: 1160 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Nombre</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Código</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Tipo</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Correlativo</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, background: colors.managementTableHead }}>Próximo N°</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Título</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead }}>Estado</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead }}>Acción</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {!reportFrontsLoading && reportFronts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} sx={{ color: colors.slate500, fontStyle: 'italic' }}>
                                Sin frentes configurados.
                              </TableCell>
                            </TableRow>
                          ) : reportFronts.map((front) => {
                            const isBaseReference = String(front.type || '').toLowerCase() === 'base';
                            return (
                            <TableRow key={String(front.id || front.code || front.name)} sx={{ opacity: front.is_active ? 1 : 0.62 }}>
                              <TableCell sx={{ minWidth: 260, fontWeight: 700 }}>{front.name}</TableCell>
                              <TableCell sx={{ minWidth: 170 }}>{front.code || '-'}</TableCell>
                              <TableCell sx={{ minWidth: 110 }}>{String(front.type || 'udr').toUpperCase()}</TableCell>
                              <TableCell sx={{ minWidth: 130 }}>
                                {front.sequence_mode === 'date_anchor' ? 'Por fecha' : 'Incremental'}
                                {front.sequence_mode === 'date_anchor' && front.date_anchor
                                  ? ` · ${formatSpanishShortDate(front.date_anchor)}`
                                  : ''}
                              </TableCell>
                              <TableCell align="right" sx={{ minWidth: 100, fontWeight: 700 }}>
                                {front.sequence_mode === 'incremental'
                                  ? String(front.next_sequence_no || 1).padStart(3, '0')
                                  : (front.date_anchor_sequence_no ? String(front.date_anchor_sequence_no).padStart(3, '0') : '-')}
                              </TableCell>
                              <TableCell sx={{ minWidth: 320 }}>{front.title_prefix}</TableCell>
                              <TableCell align="center" sx={{ minWidth: 100 }}>
                                <Box component="span" sx={{
                                  display: 'inline-flex',
                                  px: 1,
                                  py: 0.35,
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  bgcolor: front.is_active ? colors.green100 : colors.slate100,
                                  color: front.is_active ? colors.green800 : colors.slate500,
                                }}>
                                  {front.is_active ? 'Activo' : 'Inactivo'}
                                </Box>
                              </TableCell>
                              <TableCell align="center" sx={{ minWidth: 120 }}>
                                {isBaseReference ? (
                                  <Typography sx={{ color: colors.slate500, fontSize: 12, fontWeight: 700 }}>
                                    Referencia
                                  </Typography>
                                ) : (
                                  <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                                    <AppIconButton
                                      size="small"
                                      disabled={!front.is_active || !front.id || reportFrontSaving}
                                      onClick={() => requestToggleReportFrontDailyActivities(front)}
                                      sx={{
                                        color: front.include_in_daily_activities ? colors.blue600 : colors.gray6,
                                        opacity: 1,
                                        '&:hover': {
                                          bgcolor: alpha(front.include_in_daily_activities ? colors.blue600 : colors.gray6, 0.08),
                                          opacity: 1,
                                        },
                                      }}
                                      aria-label={front.include_in_daily_activities ? 'Excluir de Actividades' : 'Incluir en Actividades'}
                                      title={front.include_in_daily_activities ? 'Excluir de Actividades' : 'Incluir en Actividades'}
                                    >
                                      <AssignmentTurnedIn sx={{ fontSize: 17 }} />
                                    </AppIconButton>
                                    <AppIconButton size="small" onClick={() => openEditReportFrontDialog(front)} aria-label="Editar frente" title="Editar" sx={{ color: colors.blue600 }}>
                                      <EditOutlined sx={{ fontSize: 18 }} />
                                    </AppIconButton>
                                    <AppIconButton size="small" disabled={!front.is_active || !front.id || reportFrontSaving} onClick={() => deactivateReportFront(front)} aria-label="Desactivar frente" title="Desactivar" sx={{ color: colors.red500 }}>
                                      <Trash2 size={16} />
                                    </AppIconButton>
                                  </Stack>
                                )}
                              </TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Stack>
                </Paper>
              ) : activeTab === 'equipment' ? (
                <Box sx={{ position: 'relative', minWidth: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden', pt: { xs: 1, md: 1.25 } }}>
                  <Stack spacing={0.75} sx={{ width: '100%' }}>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1}
                      justifyContent="flex-start"
                      alignItems={{ xs: 'stretch', md: 'center' }}
                    >
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '32px minmax(0, 1fr) 32px',
                            sm: 'auto 220px auto minmax(0, 1fr) minmax(220px, 300px)',
                          },
                          gap: 0.75,
                          alignItems: 'center',
                          width: '100%',
                          minWidth: 0,
                          pr: { sm: 8 },
                        }}
                      >
                        <AppIconButton
                          size="small"
                          disabled={equipmentAvailableDates.length === 0 || equipmentAvailableDates.indexOf(String(equipmentDate || '').slice(0, 10)) <= 0}
                          onClick={() => {
                            const idx = equipmentAvailableDates.indexOf(String(equipmentDate || '').slice(0, 10));
                            if (idx <= 0) return;
                            setEquipmentDate(equipmentAvailableDates[idx - 1]);
                          }}
                          aria-label="Día anterior"
                          title="Día anterior"
                        >
                          <ChevronLeft fontSize="small" />
                        </AppIconButton>
                        <AppTextField
                          size="small"
                          label="Fecha con datos"
                          value={formatSpanishShortDate(String(equipmentDate || '').slice(0, 10)) || String(equipmentDate || '').slice(0, 10)}
                          onClick={(e) => setEquipmentDateAnchorEl(e.currentTarget)}
                          InputProps={{
                            readOnly: true,
                            endAdornment: (
                              <InputAdornment position="end">
                                <CalendarMonth sx={{ color: colors.slate500, fontSize: 20 }} />
                              </InputAdornment>
                            ),
                          }}
                          sx={{
                            width: '100%',
                            cursor: 'pointer',
                            '& .MuiInputBase-input': { textAlign: 'center' },
                          }}
                        />
                        <Popover
                          open={Boolean(equipmentDateAnchorEl)}
                          anchorEl={equipmentDateAnchorEl}
                          onClose={() => setEquipmentDateAnchorEl(null)}
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        >
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                            <DateCalendar
                              value={parseDateFromIso(String(equipmentDate || '').slice(0, 10))}
                              onChange={(value) => {
                                const next = formatIsoFromDate(value);
                                if (!next || !equipmentAvailableDatesSet.has(next)) return;
                                setEquipmentDate(next);
                                setEquipmentDateAnchorEl(null);
                              }}
                              shouldDisableDate={(day) => {
                                const iso = formatIsoFromDate(day);
                                if (!iso) return true;
                                return !equipmentAvailableDatesSet.has(iso);
                              }}
                            />
                          </LocalizationProvider>
                        </Popover>
                        <AppIconButton
                          size="small"
                          disabled={equipmentAvailableDates.length === 0 || equipmentAvailableDates.indexOf(String(equipmentDate || '').slice(0, 10)) === -1 || equipmentAvailableDates.indexOf(String(equipmentDate || '').slice(0, 10)) >= equipmentAvailableDates.length - 1}
                          onClick={() => {
                            const idx = equipmentAvailableDates.indexOf(String(equipmentDate || '').slice(0, 10));
                            if (idx < 0 || idx >= equipmentAvailableDates.length - 1) return;
                            setEquipmentDate(equipmentAvailableDates[idx + 1]);
                          }}
                          aria-label="Día siguiente"
                          title="Día siguiente"
                        >
                          <ChevronRight fontSize="small" />
                        </AppIconButton>
                        <Typography
                          sx={{
                            color: colors.managementDisabledText,
                            fontSize: 13,
                            fontWeight: 500,
                            ml: { xs: 0, sm: 0.5 },
                            minWidth: 0,
                            gridColumn: { xs: '1 / -1', sm: 'auto' },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: { xs: 'normal', sm: 'nowrap' },
                          }}
                        >
                          | Registro del día: {formatSpanishShortDate(String(equipmentDate || '').slice(0, 10)) || String(equipmentDate || '').slice(0, 10)}
                        </Typography>
                        <EquipmentSearchInput onSearch={setEquipmentSearch} />
                      </Box>
                    </Stack>

                    {equipmentError ? <AppAlert severity="error">{equipmentError}</AppAlert> : null}
                    {equipmentLoading ? (
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2 }}>
                        <CircularProgress size={22} />
                        <Typography sx={{ color: colors.gray600 }}>Cargando equipos...</Typography>
                      </Stack>
                    ) : null}

                    {(['MAYOR', 'MENOR'] as EquipmentKind[]).map((kind) => {
                      const searchQuery = equipmentSearch.trim().toLocaleLowerCase('es-CL');
                      const indexedRows = equipmentRows
                        .map((row, index) => ({ row, index }))
                        .filter((entry) => {
                          if (entry.row.equipment_kind !== kind) return false;
                          if (!searchQuery) return true;
                          const searchable = [
                            entry.row.equipment_name,
                            entry.row.patent,
                            entry.row.entry_date,
                            entry.row.return_date,
                            formatSpanishShortDate(String(entry.row.entry_date || '').slice(0, 10)),
                            formatSpanishShortDate(String(entry.row.return_date || '').slice(0, 10)),
                          ]
                            .filter(Boolean)
                            .join(' ')
                            .toLocaleLowerCase('es-CL');
                          return searchable.includes(searchQuery);
                        });
                      return (
                        <Box key={kind}>
                          <Typography sx={{ fontWeight: 700, color: colors.slate800, mb: 0.75 }}>
                            {kind === 'MAYOR' ? 'Equipos Mayores' : 'Equipos Menores'}
                          </Typography>
                          <Box
                            sx={{
                              display: { xs: 'grid', sm: 'none' },
                              gap: 1,
                              width: '100%',
                              minWidth: 0,
                            }}
                          >
                            {indexedRows.length === 0 ? (
                              <Box
                                sx={{
                                  border: `1px solid ${colors.gray200}`,
                                  borderRadius: 1,
                                  bgcolor: colors.white,
                                  p: 1.5,
                                  color: colors.slate500,
                                  fontStyle: 'italic',
                                }}
                              >
                                Sin equipos cargados para este tipo.
                              </Box>
                            ) : indexedRows.map(({ row, index }) => {
                              const statusItems = [
                                { label: 'Operativa', active: Boolean(row.is_operational), color: colors.blue6 },
                                { label: 'Mantención', active: Boolean(row.in_maintenance), color: colors.blue8 },
                                { label: 'Acreditación', active: Boolean(row.in_accreditation), color: colors.blue10 },
                                { label: 'Panne', active: Boolean(row.in_breakdown), color: colors.blue12 },
                              ];
                              const metricItems = [
                                ['Cantidad', row.quantity === null || row.quantity === undefined ? '1' : String(row.quantity)],
                                ['Canaletas', row.canaletas_qty === null || row.canaletas_qty === undefined ? '-' : String(row.canaletas_qty)],
                                ['Piscinas', row.piscinas_qty === null || row.piscinas_qty === undefined ? '-' : String(row.piscinas_qty)],
                                ['Kilometraje', row.mileage_km === null || row.mileage_km === undefined ? '-' : String(row.mileage_km)],
                                ['Ingreso', formatSpanishShortDate(String(row.entry_date || '').slice(0, 10)) || '-'],
                                ['Salida / devolución', formatSpanishShortDate(String(row.return_date || '').slice(0, 10)) || '-'],
                              ];

                              return (
                                <Box
                                  key={`${kind}-card-${index}`}
                                  sx={{
                                    border: `1px solid ${colors.slate200}`,
                                    borderRadius: 1,
                                    bgcolor: colors.white,
                                    p: { xs: 1.25, sm: 1.5 },
                                    minWidth: 0,
                                  }}
                                >
                                  <Stack spacing={1}>
                                    <Box
                                      sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                                        gap: 1,
                                        alignItems: 'start',
                                      }}
                                    >
                                      <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 700, color: colors.gray900, fontSize: 15, lineHeight: 1.25, wordBreak: 'break-word' }}>
                                          {String(row.equipment_name || '-').toUpperCase()}
                                        </Typography>
                                        <Typography sx={{ color: colors.slate500, fontSize: 12.5, mt: 0.25, wordBreak: 'break-word' }}>
                                          Patente / Nº / Serie: {String(row.patent || '-').toUpperCase()}
                                        </Typography>
                                      </Box>
                                      <Stack direction="row" spacing={0.15} sx={{ flex: '0 0 auto' }}>
                                        <Tooltip title={!getEquipmentDailyReportAvailability(row).available ? getEquipmentDailyReportAvailability(row).reason : row.include_in_daily_report === false ? 'Incluir en reporte diario' : 'Excluir del reporte diario'}>
                                          <span>
                                            <AppIconButton
                                              size="small"
                                              onClick={() => toggleEquipmentDailyReport(index)}
                                              disabled={!row.id || equipmentSaving || !getEquipmentDailyReportAvailability(row).available}
                                              aria-label={!getEquipmentDailyReportAvailability(row).available ? 'Equipo no disponible para reporte diario' : row.include_in_daily_report === false ? 'Incluir en reporte diario' : 'Excluir del reporte diario'}
                                              sx={{ color: row.include_in_daily_report === false || !getEquipmentDailyReportAvailability(row).available ? colors.slate300 : colors.blue600, p: 0.5 }}
                                            >
                                              {row.include_in_daily_report === false || !getEquipmentDailyReportAvailability(row).available
                                                ? <AssignmentLateOutlined sx={{ fontSize: 18 }} />
                                                : <AssignmentTurnedIn sx={{ fontSize: 18 }} />}
                                            </AppIconButton>
                                          </span>
                                        </Tooltip>
                                        <AppIconButton size="small" onClick={() => openEditEquipmentModal(index)} aria-label="Editar equipo" title="Editar" sx={{ color: colors.blue600, p: 0.5 }}>
                                          <EditOutlined sx={{ fontSize: 18 }} />
                                        </AppIconButton>
                                        <AppIconButton size="small" onClick={() => removeEquipmentRow(index)} aria-label="Quitar equipo" title="Quitar" sx={{ color: colors.red500, p: 0.5 }}>
                                          <Trash2 size={16} />
                                        </AppIconButton>
                                      </Stack>
                                    </Box>

                                    <Box
                                      sx={{
                                        display: 'grid',
                                        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
                                        gap: 0.6,
                                      }}
                                    >
                                      {statusItems.map((item) => (
                                        <Box
                                          key={item.label}
                                          sx={{
                                            minWidth: 0,
                                            border: `1px solid ${colors.managementBorderMuted}`,
                                            borderRadius: 1,
                                            px: 0.75,
                                            py: 0.6,
                                            bgcolor: colors.slate50,
                                          }}
                                        >
                                          <Typography sx={{ color: colors.slate400, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.1 }}>
                                            {item.label}
                                          </Typography>
                                          <Box
                                            sx={{
                                              mt: 0.45,
                                              height: 22,
                                              borderRadius: 999,
                                              border: `1px solid ${item.active ? item.color : colors.blue11}`,
                                              bgcolor: item.active ? colors.blue15 : colors.white,
                                              color: item.active ? item.color : colors.blue7,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: 11.5,
                                              fontWeight: 700,
                                              minWidth: 0,
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {item.active ? item.label : '—'}
                                          </Box>
                                        </Box>
                                      ))}
                                    </Box>

                                    <Box
                                      sx={{
                                        display: 'grid',
                                      gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
                                        gap: 0.6,
                                      }}
                                    >
                                      {metricItems.map(([label, value]) => (
                                        <Box
                                          key={label}
                                          sx={{
                                            minWidth: 0,
                                            border: `1px solid ${colors.managementBorderMuted}`,
                                            borderRadius: 1,
                                            px: 0.75,
                                            py: 0.55,
                                            bgcolor: colors.managementWhiteSoft,
                                          }}
                                        >
                                          <Typography sx={{ color: colors.slate400, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.1 }}>
                                            {label}
                                          </Typography>
                                          <Typography sx={{ color: colors.gray900, fontSize: 13, fontWeight: 700, mt: 0.4, wordBreak: 'break-word' }}>
                                            {value}
                                          </Typography>
                                        </Box>
                                      ))}
                                    </Box>

                                    {String(row.notes || '').trim() ? (
                                      <Box
                                        sx={{
                                          minWidth: 0,
                                          border: `1px solid ${colors.managementBorderMuted}`,
                                          borderRadius: 1,
                                          px: 0.75,
                                          py: 0.6,
                                          bgcolor: colors.managementWhiteSoft,
                                        }}
                                      >
                                        <Typography sx={{ color: colors.slate400, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>
                                          Notas
                                        </Typography>
                                        <Typography sx={{ color: colors.gray900, fontSize: 13, wordBreak: 'break-word' }}>
                                          {String(row.notes || '-')}
                                        </Typography>
                                      </Box>
                                    ) : null}
                                  </Stack>
                                </Box>
                              );
                            })}
                          </Box>

                          <TableContainer sx={{ display: { xs: 'none', sm: 'block' }, width: '100%', overflowX: 'auto', border: `1px solid ${colors.gray200}`, borderRadius: 1, backgroundColor: colors.white }}>
                            <Table
                              size="small"
                              sx={{
                                minWidth: 1660,
                                tableLayout: 'fixed',
                                '& .MuiTableCell-root': {
                                  px: { sm: 0.7, md: 0.9, lg: 1 },
                                  py: { sm: 0.45, md: 0.6 },
                                  fontSize: { sm: 11, md: 12 },
                                  whiteSpace: 'nowrap',
                                },
                              }}
                            >
                              <colgroup>
                                <col style={{ width: 220 }} />
                                <col style={{ width: 155 }} />
                                <col style={{ width: 105 }} />
                                <col style={{ width: 105 }} />
                                <col style={{ width: 105 }} />
                                <col style={{ width: 105 }} />
                                <col style={{ width: 110 }} />
                                <col style={{ width: 140 }} />
                                <col style={{ width: 75 }} />
                                <col style={{ width: 90 }} />
                                <col style={{ width: 90 }} />
                                <col style={{ width: 105 }} />
                                <col style={{ width: 180 }} />
                                <col style={{ width: 135 }} />
                              </colgroup>
                              <TableHead>
                                <TableRow>
                                  <TableCell
                                    sx={{
                                      fontWeight: 700,
                                      color: colors.slate400,
                                      minWidth: 220,
                                      ...(equipmentNamePinned ? {
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 3,
                                        bgcolor: colors.white,
                                        boxShadow: `1px 0 0 ${colors.gray200}`,
                                      } : {}),
                                    }}
                                  >
                                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
                                      <span>Nombre (máquina/equipo)</span>
                                      <Tooltip title={equipmentNamePinned ? 'Desfijar nombre' : 'Fijar nombre'}>
                                        <AppIconButton
                                          size="small"
                                          aria-label={equipmentNamePinned ? 'Desfijar nombre' : 'Fijar nombre'}
                                          onClick={() => setEquipmentNamePinned((current) => !current)}
                                          sx={{ color: equipmentNamePinned ? colors.blue600 : colors.slate400, p: 0.25 }}
                                        >
                                          {equipmentNamePinned ? <PushPin sx={{ fontSize: 15 }} /> : <PushPinOutlined sx={{ fontSize: 15 }} />}
                                        </AppIconButton>
                                      </Tooltip>
                                    </Stack>
                                  </TableCell>
                                  <TableCell
                                    align="center"
                                    sx={{
                                      fontWeight: 700,
                                      color: colors.slate400,
                                      minWidth: 155,
                                      ...(equipmentPatentPinned ? {
                                        position: 'sticky',
                                        left: equipmentNamePinned ? 220 : 0,
                                        zIndex: 3,
                                        bgcolor: colors.white,
                                        boxShadow: `1px 0 0 ${colors.gray200}`,
                                      } : {}),
                                    }}
                                  >
                                    <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ position: 'relative' }}>
                                      <span>Patente / Nº / Serie</span>
                                      <Tooltip title={equipmentPatentPinned ? 'Desfijar patente' : 'Fijar patente'}>
                                        <AppIconButton
                                          size="small"
                                          aria-label={equipmentPatentPinned ? 'Desfijar patente' : 'Fijar patente'}
                                          onClick={() => setEquipmentPatentPinned((current) => !current)}
                                          sx={{
                                            color: equipmentPatentPinned ? colors.blue600 : colors.slate400,
                                            p: 0.25,
                                            position: 'absolute',
                                            right: 0,
                                          }}
                                        >
                                          {equipmentPatentPinned ? <PushPin sx={{ fontSize: 15 }} /> : <PushPinOutlined sx={{ fontSize: 15 }} />}
                                        </AppIconButton>
                                      </Tooltip>
                                    </Stack>
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Operativa</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Mantención</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Acreditación</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Panne</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Ingreso</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Salida / Devolución</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Cantidad</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">CANALETAS</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">PISCINAS</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Kilometraje</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }}>Notas</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: colors.slate400 }} align="center">Acción</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {indexedRows.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={14} sx={{ color: colors.slate500, fontStyle: 'italic' }}>
                                      Sin equipos cargados para este tipo.
                                    </TableCell>
                                  </TableRow>
                                ) : indexedRows.map(({ row, index }) => (
                                  <TableRow
                                    key={`${kind}-${index}`}
                                    sx={{
                                      bgcolor: index % 2 === 0 ? colors.white : colors.slate50,
                                      '&:hover': { bgcolor: colors.managementTableHover },
                                    }}
                                  >
                                    <TableCell
                                      sx={{
                                        minWidth: 220,
                                        ...(equipmentNamePinned ? {
                                          position: 'sticky',
                                          left: 0,
                                          zIndex: 2,
                                          bgcolor: index % 2 === 0 ? colors.white : colors.slate50,
                                          boxShadow: `1px 0 0 ${colors.gray200}`,
                                        } : {}),
                                      }}
                                    >
                                      {String(row.equipment_name || '-').toUpperCase()}
                                    </TableCell>
                                    <TableCell
                                      align="center"
                                      sx={{
                                        minWidth: 155,
                                        ...(equipmentPatentPinned ? {
                                          position: 'sticky',
                                          left: equipmentNamePinned ? 220 : 0,
                                          zIndex: 2,
                                          bgcolor: index % 2 === 0 ? colors.white : colors.slate50,
                                          boxShadow: `1px 0 0 ${colors.gray200}`,
                                        } : {}),
                                      }}
                                    >
                                      {String(row.patent || '-').toUpperCase()}
                                    </TableCell>
                                    <TableCell align="center">
                                      <EquipmentStateBadge active={Boolean(row.is_operational)} label="Operativa" activeColor={colors.blue6} />
                                    </TableCell>
                                    <TableCell align="center">
                                      <EquipmentStateBadge active={Boolean(row.in_maintenance)} label="Mantención" activeColor={colors.blue8} />
                                    </TableCell>
                                    <TableCell align="center">
                                      <EquipmentStateBadge active={Boolean(row.in_accreditation)} label="Acreditada" activeColor={colors.blue10} />
                                    </TableCell>
                                    <TableCell align="center">
                                      <EquipmentStateBadge active={Boolean(row.in_breakdown)} label="Panne" activeColor={colors.blue12} />
                                    </TableCell>
                                    <TableCell align="center">
                                      <EquipmentLifecycleDate value={row.entry_date} periods={row.lifecycle_periods} />
                                    </TableCell>
                                    <TableCell align="center">
                                      <EquipmentLifecycleDate value={row.return_date} periods={row.lifecycle_periods} />
                                    </TableCell>
                                    <TableCell align="center">{row.quantity === null || row.quantity === undefined ? '1' : String(row.quantity)}</TableCell>
                                    <TableCell align="center">{row.canaletas_qty === null || row.canaletas_qty === undefined ? '-' : String(row.canaletas_qty)}</TableCell>
                                    <TableCell align="center">{row.piscinas_qty === null || row.piscinas_qty === undefined ? '-' : String(row.piscinas_qty)}</TableCell>
                                    <TableCell align="center">{row.mileage_km === null || row.mileage_km === undefined ? '-' : String(row.mileage_km)}</TableCell>
                                    <TableCell sx={{ minWidth: 0, maxWidth: 180, overflow: 'hidden' }}>
                                      <Tooltip title={String(row.notes || '').trim() || 'Sin notas'} placement="top" arrow>
                                        <Typography
                                          component="span"
                                          sx={{
                                            display: 'block',
                                            width: '100%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            fontSize: 'inherit',
                                          }}
                                        >
                                          {String(row.notes || '-').trim() || '-'}
                                        </Typography>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell align="center">
                                      <Tooltip title={!getEquipmentDailyReportAvailability(row).available ? getEquipmentDailyReportAvailability(row).reason : row.include_in_daily_report === false ? 'Incluir en reporte diario' : 'Excluir del reporte diario'}>
                                        <span>
                                          <AppIconButton
                                            size="small"
                                            onClick={() => toggleEquipmentDailyReport(index)}
                                            disabled={!row.id || equipmentSaving || !getEquipmentDailyReportAvailability(row).available}
                                            aria-label={!getEquipmentDailyReportAvailability(row).available ? 'Equipo no disponible para reporte diario' : row.include_in_daily_report === false ? 'Incluir en reporte diario' : 'Excluir del reporte diario'}
                                            sx={{ color: row.include_in_daily_report === false || !getEquipmentDailyReportAvailability(row).available ? colors.slate300 : colors.blue600 }}
                                          >
                                            {row.include_in_daily_report === false || !getEquipmentDailyReportAvailability(row).available
                                              ? <AssignmentLateOutlined sx={{ fontSize: 18 }} />
                                              : <AssignmentTurnedIn sx={{ fontSize: 18 }} />}
                                          </AppIconButton>
                                        </span>
                                      </Tooltip>
                                      <AppIconButton size="small" onClick={() => openEditEquipmentModal(index)} aria-label="Editar equipo" title="Editar" sx={{ color: colors.blue600 }}>
                                        <EditOutlined sx={{ fontSize: 18 }} />
                                      </AppIconButton>
                                      <AppIconButton size="small" onClick={() => removeEquipmentRow(index)} aria-label="Quitar equipo" title="Quitar" sx={{ color: colors.red500 }}>
                                        <Trash2 size={16} />
                                      </AppIconButton>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              ) : activeTab === 'photo-report' ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.5, md: 2 },
                    borderColor: colors.managementBorder,
                    borderRadius: 2,
                    background: colors.white,
                    boxShadow: '0 10px 28px rgba(15, 50, 90, 0.07)',
                  }}
                >
                  <Stack spacing={1.75}>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1.25}
                      alignItems={{ xs: 'stretch', md: 'center' }}
                      justifyContent="space-between"
                      sx={{ pb: 1.5, borderBottom: `1px solid ${colors.managementBorderMuted}` }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 600, color: colors.blue1, fontSize: { xs: '1rem', md: '1.1rem' } }}>
                          Vista previa de carátula (PPTX)
                        </Typography>
                        <Typography sx={{ mt: 0.2, fontSize: 12.5, color: colors.managementTextMuted, fontWeight: 500 }}>
                          Página {currentPreviewPage} de {Math.max(1, totalPhotoSlides)}
                        </Typography>
                        {activePhotoEvidenceSummary ? (
                          <Typography
                            sx={{ mt: 0.2, fontSize: 12.5, color: colors.slate700 }}
                            noWrap
                            title={activePhotoEvidenceSummary}
                          >
                            {activePhotoEvidenceSummary}
                          </Typography>
                        ) : null}
                        <Typography
                          sx={{
                            mt: 0.15,
                            fontSize: 11.5,
                            color: !hasPhotoPeriodSelected
                              ? colors.slate500
                              : photoConfigDirty
                                ? colors.amber700
                                : (photoConfigExistsForScope ? colors.slate500 : colors.red800),
                            fontWeight: 500,
                          }}
                        >
                          {!hasPhotoPeriodSelected
                            ? 'Selecciona un rango de fechas para armar el informe.'
                            : photoConfigDirty
                              ? 'Hay cambios sin guardar.'
                              : photoConfigExistsForScope
                                ? 'Cambios guardados.'
                                : 'No existe guardado para este rango. Debes guardar antes de exportar.'}
                        </Typography>
                      </Box>
                      <Stack
                        direction="row"
                        spacing={0.8}
                        sx={{
                          alignSelf: { xs: 'stretch', md: 'auto' },
                          flexWrap: 'wrap',
                          gap: 0.8,
                          '& > *': { m: '0 !important' },
                        }}
                      >
                        <AppButton
                          variant="outlined"
                          startIcon={<PushPinOutlined />}
                          onClick={() => {
                            setPhotoRestoreSelection(includedPhotoEvidenceKeys);
                            setPhotoRestoreSelectionOrder(() => {
                              const selected = new Set(Object.keys(includedPhotoEvidenceKeys).filter((key) => includedPhotoEvidenceKeys[key]));
                              const ordered = includedPhotoEvidenceOrder.filter((key) => selected.has(key));
                              const missing = Array.from(selected).filter((key) => !ordered.includes(key));
                              return [...ordered, ...missing];
                            });
                            setPhotoRestoreDialogOpen(true);
                          }}
                          disabled={!hasPhotoPeriodSelected || selectablePhotoCandidates.length === 0}
                        >
                          Seleccionar fotos ({Object.keys(includedPhotoEvidenceKeys).length})
                        </AppButton>
                        <AppButton
                          variant="contained"
                          onClick={() => void savePhotoReportConfig()}
                          disabled={photoConfigSaving || !photoConfigDirty || !hasPhotoPeriodSelected}
                        >
                          {photoConfigSaving ? 'Guardando...' : 'Guardar configuración'}
                        </AppButton>
                        <AppButton
                          variant="contained"
                          startIcon={photoExporting ? <CircularProgress size={16} sx={{ color: colors.white }} /> : <Download />}
                          onClick={() => void exportPhotoReportPptx()}
                          disabled={photoExporting || !canExportPhotoReport || !hasPhotoPeriodSelected}
                        >
                          {photoExporting ? 'Exportando...' : 'Exportar PPTX'}
                        </AppButton>
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          md: 'minmax(230px, 290px) minmax(0, 1fr)',
                          lg: 'minmax(250px, 320px) minmax(0, 1fr)',
                          xl: '340px minmax(0, 1fr)',
                        },
                        gap: { xs: 1.25, md: 1.5 },
                        alignItems: 'start',
                        minWidth: 0,
                      }}
                    >
                      <Paper
                        variant="outlined"
                        sx={{
                          p: { xs: 1.25, md: 1.5 },
                          borderColor: colors.managementBorder,
                          borderRadius: 1.5,
                          minWidth: 0,
                          width: '100%',
                          bgcolor: colors.white,
                          boxShadow: '0 8px 22px rgba(15, 50, 90, 0.06)',
                        }}
                      >
                        <AppFormStack>
                          <Box sx={{ pb: 0.9, borderBottom: `1px solid ${colors.managementBorderMuted}` }}>
                            <Typography sx={{ color: colors.blue1, fontSize: 14, fontWeight: 600 }}>
                              Configuración del informe
                            </Typography>
                            <Typography sx={{ mt: 0.15, color: colors.managementTextMuted, fontSize: 11.5, fontWeight: 400 }}>
                              Ajusta portada, período y páginas de exportación.
                            </Typography>
                          </Box>
                          <AppTextField
                              select
                              label="Reportes guardados"
                              value={selectedSavedPhotoConfigId}
                              InputLabelProps={{ shrink: true }}
                              SelectProps={{
                                displayEmpty: true,
                                renderValue: (selectedValue) => {
                                  if (savedPhotoConfigsLoading) return 'Cargando...';
                                  const selected = savedPhotoConfigs.find((config) => String(config.id) === String(selectedValue || ''));
                                  return selected
                                    ? `N°${selected.report_no} | ${formatSpanishShortDate(String(selected.period_start || ''))} - ${formatSpanishShortDate(String(selected.period_end || ''))}`
                                    : 'Seleccionar reporte';
                                },
                              }}
                              onChange={(event) => {
                                const selectedId = String(event.target.value || '').trim();
                                const selected = savedPhotoConfigs.find((cfg) => String(cfg.id) === selectedId);
                                if (!selected) return;
                                setSelectedSavedPhotoConfigId(selectedId);
                                const selectedStart = String(selected.period_start || '').slice(0, 10);
                                const selectedEnd = String(selected.period_end || '').slice(0, 10);
                                setPhotoCoverReportNo(String(selected.report_no || '').trim() || formatPhotoReportNumberForPeriod(selectedStart, selectedEnd));
                                setPhotoPeriodStartDate(selectedStart);
                                setPhotoPeriodEndDate(selectedEnd);
                                setPhotoTempStartDate(parseDateFromIso(selectedStart));
                                setPhotoTempEndDate(parseDateFromIso(selectedEnd));
                                setPhotoKeywordFilter('');
                                setPhotoSelectFrontFilter('');
                                setPhotoSelectModuleFilter('');
                                setPhotoSelectActivityFilter('');
                                setPhotoConfigDirty(false);
                              }}
                            >
                              <MenuItem value="" disabled>
                                {savedPhotoConfigsLoading ? 'Cargando...' : ''}
                              </MenuItem>
                              {savedPhotoConfigs.map((cfg) => (
                                <MenuItem key={cfg.id} value={cfg.id}>
                                  {`N°${cfg.report_no} | ${formatSpanishShortDate(String(cfg.period_start || ''))} - ${formatSpanishShortDate(String(cfg.period_end || ''))}`}
                                </MenuItem>
                              ))}
                          </AppTextField>
                          <AppTextField
                            label="Título de portada"
                            value={photoCoverTitle}
                            onChange={(event) => setPhotoCoverTitle(event.target.value)}
                          />
                          <AppTextField
                            label="N° informe"
                            value={photoCoverReportNo}
                            InputProps={{ readOnly: true }}
                          />
                          <AppTextField
                            label="Período"
                            value={photoPeriodInputLabel}
                            placeholder="Seleccionar rango de fechas"
                            InputLabelProps={{ shrink: true }}
                            onClick={() => {
                              setPhotoTempStartDate(parseDateFromIso(photoPeriodStartDate));
                              setPhotoTempEndDate(parseDateFromIso(photoPeriodEndDate));
                              setPhotoRangeDialogOpen(true);
                            }}
                            InputProps={{
                              readOnly: true,
                              endAdornment: (
                                <InputAdornment position="end">
                                  <CalendarMonth sx={{ color: colors.slate500 }} />
                                </InputAdornment>
                              ),
                              sx: { cursor: 'pointer' },
                            }}
                          />
                          <AppSearchField
                            label="Filtrar por palabra o frase"
                            value={photoKeywordFilter}
                            onChange={(event) => setPhotoKeywordFilter(event.target.value)}
                            helperText={
                              photoKeywordQuery
                                ? `Mostrando ${visiblePhotoEvidenceCount} de ${totalPhotoEvidenceCount} imágenes`
                                : `Sin filtro: ${visiblePhotoEvidenceCount} imágenes visibles`
                            }
                            InputProps={{
                              endAdornment: photoKeywordFilter ? (
                                <InputAdornment position="end">
                                  <AppIconButton
                                    size="small"
                                    onClick={() => setPhotoKeywordFilter('')}
                                    aria-label="Limpiar filtro fotográfico"
                                    sx={{ color: colors.slate500 }}
                                  >
                                    <Clear fontSize="small" />
                                  </AppIconButton>
                                </InputAdornment>
                              ) : null,
                            }}
                          />
                          <AppTextField
                            label="Título subcarátula"
                            value={activePhotoSectionTitleValue}
                            onChange={(event) => {
                              setActivePhotoSectionTitle(event.target.value);
                              setPhotoConfigDirty(true);
                            }}
                            helperText={
                              activePhotoSectionKey === 'pis'
                                ? 'Sección PISCINAS'
                                : activePhotoSectionKey === 'adi'
                                  ? 'Sección ADICIONALES'
                                  : 'Sección CANALETAS'
                            }
                          />
                          <Box>
                            <Typography sx={{ mb: 0.7, color: colors.managementTextMuted, fontSize: 11.5, fontWeight: 500 }}>
                              Páginas a exportar
                            </Typography>
                            <Stack direction="row" spacing={0.8} sx={{ width: '100%' }}>
                              <AppTextField
                                label="Desde"
                                type="number"
                                fullWidth
                                value={photoExportRangeStart}
                                placeholder="Todas"
                                onChange={(event) => {
                                  const raw = String(event.target.value || '').trim();
                                  if (!raw) return setPhotoExportRangeStart('');
                                  const parsed = Math.max(1, Math.min(Math.max(1, totalPhotoSlides), Math.trunc(Number(raw) || 1)));
                                  setPhotoExportRangeStart(String(parsed));
                                }}
                                InputProps={{ sx: { '& input': { textAlign: 'center' } } }}
                                inputProps={{ min: 1, max: Math.max(1, totalPhotoSlides) }}
                              />
                              <AppTextField
                                label="Hasta"
                                type="number"
                                fullWidth
                                value={photoExportRangeEnd}
                                placeholder="Todas"
                                onChange={(event) => {
                                  const raw = String(event.target.value || '').trim();
                                  if (!raw) return setPhotoExportRangeEnd('');
                                  const parsed = Math.max(1, Math.min(Math.max(1, totalPhotoSlides), Math.trunc(Number(raw) || totalPhotoSlides)));
                                  setPhotoExportRangeEnd(String(parsed));
                                }}
                                InputProps={{ sx: { '& input': { textAlign: 'center' } } }}
                                inputProps={{ min: 1, max: Math.max(1, totalPhotoSlides) }}
                              />
                            </Stack>
                          </Box>
                          <AppTextField
                            select
                            label="Ir a sector"
                            value={activeSectorIndex >= 0 ? String(activeSectorIndex) : ''}
                            onChange={(event) => goToSector(Number(event.target.value))}
                          >
                            {sectorPageRanges.map((sector, index) => (
                              <MenuItem key={sector.key} value={String(index)}>
                                {sector.label} ({sector.start}-{sector.end})
                              </MenuItem>
                            ))}
                          </AppTextField>
                          <Stack direction="row" spacing={0.8} sx={{ '& > *': { flex: 1 } }}>
                            <AppButton
                              size="small"
                              variant="outlined"
                              disabled={activeSectorIndex <= 0}
                              onClick={() => goToSector(activeSectorIndex - 1)}
                            >
                              Sector anterior
                            </AppButton>
                            <AppButton
                              size="small"
                              variant="outlined"
                              disabled={activeSectorIndex < 0 || activeSectorIndex >= sectorPageRanges.length - 1}
                              onClick={() => goToSector(activeSectorIndex + 1)}
                            >
                              Sector siguiente
                            </AppButton>
                          </Stack>
                          <Accordion disableGutters elevation={0} sx={{ border: `1px solid ${colors.managementBorder}`, borderRadius: 1.25, '&:before': { display: 'none' } }}>
                            <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 36 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 500, color: colors.slate700 }}>Opciones avanzadas (URLs)</Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{ pt: 0.5 }}>
                              <Stack spacing={1}>
                                <AppTextField
                                  size="small"
                                  label="URL fondo"
                                  value={photoCoverBackgroundUrl}
                                  onChange={(event) => setPhotoCoverBackgroundUrl(event.target.value)}
                                />
                                <AppTextField
                                  size="small"
                                  label="URL logo central"
                                  value={photoCoverLogoUrl}
                                  onChange={(event) => setPhotoCoverLogoUrl(event.target.value)}
                                />
                                <AppTextField
                                  size="small"
                                  label="URL fondo página 2"
                                  value={photoPage2BackgroundUrl}
                                  onChange={(event) => setPhotoPage2BackgroundUrl(event.target.value)}
                                />
                                <AppTextField
                                  size="small"
                                  label="URL fondo página 3"
                                  value={photoPage3BackgroundUrl}
                                  onChange={(event) => setPhotoPage3BackgroundUrl(event.target.value)}
                                />
                              </Stack>
                            </AccordionDetails>
                          </Accordion>
                        </AppFormStack>
                      </Paper>

                      <Box
                        sx={{
                          width: {
                            xs: '100%',
                            md: 'min(100%, calc((100vh - 210px) * 16 / 9))',
                          },
                          maxWidth: '100%',
                          minWidth: 0,
                          justifySelf: 'center',
                          aspectRatio: '16 / 9',
                          containerType: 'inline-size',
                          borderRadius: 2,
                          overflow: 'hidden',
                          border: `1px solid ${alpha(colors.slate400, 0.45)}`,
                          boxShadow: `0 18px 44px ${alpha(colors.managementDeepShadowBlue, 0.26)}`,
                          position: 'relative',
                        }}
                      >
                        <Box
                          sx={{
                            width: `${Math.max(1, totalPhotoSlides) * 100}%`,
                            height: '100%',
                            display: 'flex',
                            transition: photoPreviewTransitionEnabled ? 'transform 320ms ease' : 'none',
                            transform: `translateX(-${photoPreviewSlide * (100 / Math.max(1, totalPhotoSlides))}%)`,
                            '& > *': { flexShrink: 0 },
                          }}
                        >
                          <Box
                            sx={{
                              width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                              height: '100%',
                              backgroundColor: colors.managementNavy,
                              backgroundImage: `
                                url(${DEFAULT_PHOTO_REPORT_BACKGROUND_URL})
                              `,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              py: { xs: 3, md: 4.25 },
                              px: { xs: 2.25, md: 5 },
                              color: colors.white,
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: 'clamp(0.56rem, 2.08cqw, 1.65rem)',
                                lineHeight: 1.24,
                                letterSpacing: '0.01em',
                                textAlign: 'center',
                                fontWeight: 500,
                                maxWidth: '84%',
                                textWrap: 'balance',
                                textShadow: `0 2px 6px ${alpha(colors.black, 0.32)}`,
                              }}
                            >
                              {photoCoverTitle || 'Titulo de informe fotografico'}
                            </Typography>

                            <Stack spacing={{ xs: 1.1, md: 1.5 }} alignItems="center" sx={{ width: '100%' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoCoverLogoUrl || DEFAULT_PHOTO_REPORT_LOGO_URL}
                                alt="Logo central"
                                style={{
                                  width: 'clamp(58px, 15.8cqw, 210px)',
                                  height: 'auto',
                                  maxHeight: 'clamp(58px, 15.8cqw, 210px)',
                                  objectFit: 'contain',
                                  filter: `drop-shadow(0 10px 22px ${alpha(colors.black, 0.2)})`,
                                }}
                              />

                              <Box sx={{ width: '56%', borderTop: `2px solid ${alpha(colors.white, 0.9)}` }} />

                              <Typography sx={{ fontSize: 'clamp(0.62rem, 1.9cqw, 1.5rem)', fontWeight: 500, letterSpacing: '0.01em', textAlign: 'center' }}>
                                PRESENTACION FOTOGRAFICA
                              </Typography>
                              <Typography sx={{ fontSize: 'clamp(0.66rem, 2.15cqw, 1.8rem)', fontWeight: 500, textAlign: 'center' }}>
                                {hasPhotoPeriodSelected ? `Informe N°${photoCoverReportNo}` : 'Informe sin rango'}
                              </Typography>
                            </Stack>

                            <Typography
                              sx={{
                                fontSize: 'clamp(0.62rem, 2cqw, 1.7rem)',
                                lineHeight: 1.2,
                                textAlign: 'center',
                                fontWeight: 500,
                                textShadow: `0 2px 6px ${alpha(colors.black, 0.32)}`,
                                maxWidth: '90%',
                                textWrap: 'balance',
                              }}
                            >
                              {hasPhotoPeriodSelected ? photoCoverPeriod : 'Selecciona un rango de fechas'}
                            </Typography>
                          </Box>

                          <Box
                            sx={{
                              width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                              height: '100%',
                              backgroundColor: colors.managementNavy,
                              backgroundImage: `
                                url(${photoPage2BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE2_BACKGROUND_URL})
                              `,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              position: 'relative',
                              px: { xs: 2.25, md: 5 },
                            }}
                          >
                            <Typography
                              sx={{
                                position: 'absolute',
                                right: { xs: '4.5%', md: '5%' },
                                top: { xs: '52%', md: '49.8%' },
                                color: colors.white,
                                textAlign: 'right',
                                fontWeight: 700,
                                letterSpacing: '0.01em',
                                fontSize: 'clamp(0.48rem, 1.82cqw, 1.48rem)',
                                lineHeight: 1.15,
                                textShadow: `0 2px 8px ${alpha(colors.black, 0.42)}`,
                                width: '56%',
                                textTransform: 'uppercase',
                              }}
                            >
                              REGISTRO FOTOGRAFICO SEMANAL
                            </Typography>
                          </Box>

                          <Box
                            sx={{
                              width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                              height: '100%',
                              position: 'relative',
                              overflow: 'hidden',
                              backgroundColor: colors.managementPptBlue,
                              backgroundImage: `
                                url(${photoPage3BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL})
                              `,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Typography
                              sx={{
                                color: colors.white,
                                textAlign: 'center',
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                fontSize: 'clamp(0.82rem, 4.2cqw, 3.5rem)',
                                lineHeight: 1.16,
                                textTransform: 'uppercase',
                                maxWidth: '52%',
                                whiteSpace: 'pre-line',
                                zIndex: 1,
                              }}
                            >
                              {(photoPage3AreaTitle || 'ÁREA CANALETAS').replace(/\s+/, '\n')}
                            </Typography>
                          </Box>

                          {canaletasPhotoGroups.map((group, idx) => {
                            const first = group.items[0] || null;
                            const second = group.items[1] || null;
                            const third = group.items[2] || null;
                            const firstUrl = first?.evidence?.key ? photoEvidencePreviewByKey[first.evidence.key] : '';
                            const secondUrl = second?.evidence?.key ? photoEvidencePreviewByKey[second.evidence.key] : '';
                            const thirdUrl = third?.evidence?.key ? photoEvidencePreviewByKey[third.evidence.key] : '';
                            return (
                              <Box
                                key={`photo-group-canaletas-${group.items.map((it) => String(it?.evidence?.key || '')).join('|') || idx}`}
                                sx={{
                                  width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                                  height: '100%',
                                  position: 'relative',
                                  overflow: 'hidden',
                                  backgroundColor: colors.managementPptBlue,
                                  backgroundImage: `
                                    linear-gradient(0deg, ${alpha(colors.managementPptBlue, 0.2)}, ${alpha(colors.managementPptBlue, 0.2)}),
                                    url(${photoPage3BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL})
                                  `,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                }}
                              >
                                <Typography sx={{ position: 'absolute', right: '3%', top: '2.1%', color: colors.white, fontSize: 'clamp(0.42rem, 1.45cqw, 1.2rem)', fontWeight: 700 }}>
                                  {'"Contratos de Construcción GRPO 2025_2026"'}
                                </Typography>
                                {renderPhotoGroupTitleInput(group, photoPage3AreaTitle || 'ÁREA CANALETAS')}
                                {renderPhotoPreviewGroupImages(group, [firstUrl, secondUrl, thirdUrl])}
                              </Box>
                            );
                          })}

                          <Box
                            sx={{
                              width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                              height: '100%',
                              position: 'relative',
                              overflow: 'hidden',
                              backgroundColor: colors.managementPptBlue,
                              backgroundImage: `
                                url(${photoPage3BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL})
                              `,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Typography
                              sx={{
                                color: colors.white,
                                textAlign: 'center',
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                fontSize: 'clamp(0.82rem, 4.2cqw, 3.5rem)',
                                lineHeight: 1.16,
                                textTransform: 'uppercase',
                                maxWidth: '52%',
                                whiteSpace: 'pre-line',
                                zIndex: 1,
                              }}
                            >
                              {(photoPiscinasAreaTitle || 'ÁREA PISCINAS').replace(/\s+/, '\n')}
                            </Typography>
                          </Box>

                          {piscinasPhotoGroups.map((group, idx) => {
                            const first = group.items[0] || null;
                            const second = group.items[1] || null;
                            const third = group.items[2] || null;
                            const firstUrl = first?.evidence?.key ? photoEvidencePreviewByKey[first.evidence.key] : '';
                            const secondUrl = second?.evidence?.key ? photoEvidencePreviewByKey[second.evidence.key] : '';
                            const thirdUrl = third?.evidence?.key ? photoEvidencePreviewByKey[third.evidence.key] : '';
                            return (
                              <Box
                                key={`photo-group-piscinas-${group.items.map((it) => String(it?.evidence?.key || '')).join('|') || idx}`}
                                sx={{
                                  width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                                  height: '100%',
                                  position: 'relative',
                                  overflow: 'hidden',
                                  backgroundColor: colors.managementPptBlue,
                                  backgroundImage: `
                                    linear-gradient(0deg, ${alpha(colors.managementPptBlue, 0.2)}, ${alpha(colors.managementPptBlue, 0.2)}),
                                    url(${photoPage3BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL})
                                  `,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                }}
                              >
                                <Typography sx={{ position: 'absolute', right: '3%', top: '2.1%', color: colors.white, fontSize: 'clamp(0.42rem, 1.45cqw, 1.2rem)', fontWeight: 700 }}>
                                  {'"Contratos de Construcción GRPO 2025_2026"'}
                                </Typography>
                                {renderPhotoGroupTitleInput(group, photoPiscinasAreaTitle || 'ÁREA PISCINAS')}
                                {renderPhotoPreviewGroupImages(group, [firstUrl, secondUrl, thirdUrl])}
                              </Box>
                            );
                          })}

                          <Box
                            sx={{
                              width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                              height: '100%',
                              position: 'relative',
                              overflow: 'hidden',
                              backgroundColor: colors.managementPptBlue,
                              backgroundImage: `
                                url(${photoPage3BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL})
                              `,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexDirection: 'column',
                            }}
                          >
                            <Typography
                              sx={{
                                color: colors.white,
                                textAlign: 'center',
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                fontSize: 'clamp(0.82rem, 4cqw, 3.2rem)',
                                lineHeight: 1.1,
                                textTransform: 'uppercase',
                                whiteSpace: 'pre-line',
                                zIndex: 1,
                              }}
                            >
                              {photoAdicionalesAreaTitle || 'ADICIONALES'}
                            </Typography>
                          </Box>

                          {adicionalesPhotoGroups.map((group, idx) => {
                            const first = group.items[0] || null;
                            const second = group.items[1] || null;
                            const third = group.items[2] || null;
                            const firstUrl = first?.evidence?.key ? photoEvidencePreviewByKey[first.evidence.key] : '';
                            const secondUrl = second?.evidence?.key ? photoEvidencePreviewByKey[second.evidence.key] : '';
                            const thirdUrl = third?.evidence?.key ? photoEvidencePreviewByKey[third.evidence.key] : '';
                            return (
                              <Box
                                key={`photo-group-adicionales-${group.items.map((it) => String(it?.evidence?.key || '')).join('|') || idx}`}
                                sx={{
                                  width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                                  height: '100%',
                                  position: 'relative',
                                  overflow: 'hidden',
                                  backgroundColor: colors.managementPptBlue,
                                  backgroundImage: `
                                    linear-gradient(0deg, ${alpha(colors.managementPptBlue, 0.2)}, ${alpha(colors.managementPptBlue, 0.2)}),
                                    url(${photoPage3BackgroundUrl || DEFAULT_PHOTO_REPORT_PAGE3_BACKGROUND_URL})
                                  `,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                }}
                              >
                                <Typography sx={{ position: 'absolute', right: '3%', top: '2.1%', color: colors.white, fontSize: 'clamp(0.42rem, 1.45cqw, 1.2rem)', fontWeight: 700 }}>
                                  {'"Contratos de Construcción GRPO 2025_2026"'}
                                </Typography>
                                {renderPhotoGroupTitleInput(group, photoAdicionalesAreaTitle || 'ADICIONALES')}
                                {renderPhotoPreviewGroupImages(group, [firstUrl, secondUrl, thirdUrl])}
                              </Box>
                            );
                          })}

                          <Box
                            sx={{
                              width: `${100 / Math.max(1, totalPhotoSlides)}%`,
                              height: '100%',
                              backgroundColor: colors.managementNavy,
                              backgroundImage: `
                                url(${DEFAULT_PHOTO_REPORT_BACKGROUND_URL})
                              `,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              pt: { xs: 12.2, md: 14.8 },
                              px: { xs: 2.25, md: 5 },
                              color: colors.white,
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photoCoverLogoUrl || DEFAULT_PHOTO_REPORT_LOGO_URL}
                              alt="Logo final"
                              style={{
                                width: 'clamp(58px, 14cqw, 200px)',
                                height: 'auto',
                                objectFit: 'contain',
                                filter: `drop-shadow(0 10px 22px ${alpha(colors.black, 0.2)})`,
                              }}
                            />
                            <Box sx={{ mt: { xs: 3.1, md: 4.1 }, width: '82%', borderTop: `2px solid ${alpha(colors.white, 0.9)}` }} />
                            <Typography sx={{ mt: 1.9, fontSize: 'clamp(0.48rem, 1.65cqw, 1.35rem)', textAlign: 'center', fontWeight: 500 }}>
                              Badajoz 45, Piso 5 - Edificio los fundadores. Las Condes
                            </Typography>
                            <Typography sx={{ mt: 0.65, fontSize: 'clamp(0.58rem, 2cqw, 1.7rem)', textAlign: 'center', fontWeight: 700 }}>
                              www.pugamujica.cl
                            </Typography>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              justifyContent="center"
                              sx={{ mt: 2.45, minWidth: 0, width: 'fit-content', mx: 'auto', transform: 'translateX(9%)' }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={DEFAULT_PHOTO_REPORT_FINAL_COMPANY_LOGO_URL}
                                alt="Logo Puga Mujica"
                                style={{
                                  width: 'clamp(12px, 2.2cqw, 30px)',
                                  height: 'clamp(12px, 2.2cqw, 30px)',
                                  objectFit: 'contain',
                                }}
                              />
                              <Typography sx={{ fontSize: 'clamp(0.5rem, 1.7cqw, 1.4rem)', textAlign: 'left', fontWeight: 500 }}>
                                Puga, Mujica Asociados S.A.
                              </Typography>
                            </Stack>
                          </Box>
                        </Box>

                        {totalPhotoSlides > 1 ? <AppIconButton
                          onClick={() => setPhotoPreviewSlide((prev) => (prev <= 0 ? Math.max(0, totalPhotoSlides - 1) : prev - 1))}
                          aria-label="Anterior"
                          sx={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: colors.white,
                            bgcolor: alpha(colors.slate900, 0.35),
                            border: `1px solid ${alpha(colors.white, 0.4)}`,
                            '&:hover': { bgcolor: alpha(colors.slate900, 0.55) },
                          }}
                        >
                          <ChevronLeft />
                        </AppIconButton> : null}
                        {totalPhotoSlides > 1 ? <AppIconButton
                          onClick={() => setPhotoPreviewSlide((prev) => (prev >= Math.max(0, totalPhotoSlides - 1) ? 0 : prev + 1))}
                          aria-label="Siguiente"
                          sx={{
                            position: 'absolute',
                            right: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: colors.white,
                            bgcolor: alpha(colors.slate900, 0.35),
                            border: `1px solid ${alpha(colors.white, 0.4)}`,
                            '&:hover': { bgcolor: alpha(colors.slate900, 0.55) },
                          }}
                        >
                          <ChevronRight />
                        </AppIconButton> : null}
                      </Box>
                    </Box>
                  </Stack>
                </Paper>
              ) : (
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.5, md: 2 },
                    borderColor: colors.managementBorder,
                    background: colors.white,
                  }}
                >
                  {interferencesError ? (
                    <AppAlert severity="error">{interferencesError}</AppAlert>
                  ) : interferencesLoading ? (
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3 }}>
                      <CircularProgress size={22} />
                      <Typography sx={{ color: colors.gray600 }}>Cargando interferencias...</Typography>
                    </Stack>
                  ) : interferences.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: 'center' }}>
                      <Typography sx={{ color: colors.slate500 }}>No hay interferencias registradas.</Typography>
                    </Box>
                  ) : (
                    <TableContainer sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 1 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Fecha</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Frente</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Tipo</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Detalle tipo</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead }}>Inicio</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead }}>Fin</TableCell>
                            <TableCell sx={{ fontWeight: 700, background: colors.managementTableHead }}>Nota</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, background: colors.managementTableHead }}>Imágenes</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {interferences.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell sx={{ py: 0.75 }}>{formatDate(String(item.interference_date || item.created_at || ''))}</TableCell>
                              <TableCell sx={{ py: 0.75 }}>{item.work_front || '-'}</TableCell>
                              <TableCell sx={{ py: 0.75 }}>{item.time_type || '-'}</TableCell>
                              <TableCell sx={{ py: 0.75 }}>{item.time_detail || '-'}</TableCell>
                              <TableCell align="center" sx={{ py: 0.75 }}>{formatTime(item.start_time)}</TableCell>
                              <TableCell align="center" sx={{ py: 0.75 }}>{formatTime(item.end_time)}</TableCell>
                              <TableCell sx={{ py: 0.75, maxWidth: 360 }}>
                                <Typography variant="body2" noWrap title={item.note || ''}>
                                  {item.note || '-'}
                                </Typography>
                              </TableCell>
                              <TableCell align="center" sx={{ py: 0.75 }}>
                                {Array.isArray(item.images) ? item.images.length : 0}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              )}
            </Box>
          </Box>

        </Stack>
      </Container>
      <Dialog
        open={photoRestoreDialogOpen}
        onClose={() => setPhotoRestoreDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            width: { xs: 'calc(100vw - 16px)', sm: '95vw' },
            height: { xs: 'calc(100dvh - 16px)', sm: '95vh' },
            maxWidth: '95vw',
            maxHeight: '95vh',
            m: { xs: 1, sm: 0 },
            borderRadius: 2,
            border: `1px solid ${colors.managementBorder}`,
            bgcolor: colors.white,
            boxShadow: '0 20px 60px rgba(0, 26, 51, 0.22)',
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle
          sx={{
            px: { xs: 1.5, sm: 2.25 },
            py: 1.35,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            color: colors.blue1,
            borderBottom: `1px solid ${colors.managementBorderMuted}`,
          }}
        >
          <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                color: colors.blue600,
                bgcolor: colors.blue50,
              }}
            >
              <PhotoLibraryOutlined sx={{ fontSize: 20 }} />
            </Box>
            <Typography component="span" sx={{ fontSize: { xs: 17, sm: 18 }, fontWeight: 600, lineHeight: 1.25 }} noWrap>
              Seleccionar imágenes del informe
            </Typography>
          </Stack>
          <AppIconButton
            size="small"
            onClick={() => setPhotoRestoreDialogOpen(false)}
            aria-label="Cerrar selección de imágenes"
            title="Cerrar"
            sx={{ color: colors.slate500, flexShrink: 0 }}
          >
            <Clear fontSize="small" />
          </AppIconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            p: { xs: 1.25, sm: 1.75 },
            bgcolor: colors.managementPageBg,
          }}
        >
          {selectablePhotoCandidates.length === 0 ? (
            <Typography sx={{ color: colors.slate500 }}>No hay imágenes candidatas para este rango.</Typography>
          ) : (
            <Stack spacing={1} sx={{ minHeight: 0, flex: 1 }}>
              <AppAlert severity="info" sx={{ py: 0.35 }}>
                {photoPeriodInputLabel ? `Período: ${photoPeriodInputLabel}` : 'Selecciona un período antes de elegir imágenes.'}
              </AppAlert>
              <Paper
                variant="outlined"
                sx={{
                  px: 1.25,
                  py: 0.9,
                  borderColor: colors.managementBorderMuted,
                  borderRadius: 1.25,
                  bgcolor: colors.white,
                  display: 'flex',
                  alignItems: { xs: 'stretch', md: 'center' },
                  justifyContent: 'space-between',
                  flexDirection: { xs: 'column', md: 'row' },
                  gap: 0.9,
                }}
              >
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, '& > *': { m: '0 !important' } }}>
                  <AppButton
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      const orderedKeys: string[] = [];
                      const all = filteredSelectablePhotoCandidates.reduce<Record<string, true>>((acc, item) => {
                        const key = String(item.key || '').trim();
                        if (key) {
                          acc[key] = true;
                          orderedKeys.push(key);
                        }
                        return acc;
                      }, {});
                      setPhotoRestoreSelection(all);
                      setPhotoRestoreSelectionOrder(orderedKeys);
                    }}
                  >
                    Seleccionar visibles
                  </AppButton>
                  <AppButton
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setPhotoRestoreSelection({});
                      setPhotoRestoreSelectionOrder([]);
                    }}
                  >
                    Limpiar selección
                  </AppButton>
                  <AppButton
                    size="small"
                    variant="text"
                    onClick={() => {
                      setPhotoKeywordFilter('');
                      setPhotoSelectFrontFilter('');
                      setPhotoSelectModuleFilter('');
                      setPhotoSelectActivityFilter('');
                    }}
                  >
                    Limpiar filtros
                  </AppButton>
                </Stack>
                <Typography sx={{ color: colors.managementTextMuted, fontSize: 12.5, fontWeight: 400 }}>
                  {filteredSelectedPhotoCount} seleccionadas visibles de {filteredSelectablePhotoCandidates.length}
                  {filteredSelectablePhotoCandidates.length !== selectablePhotoCandidates.length
                    ? ` · ${Object.keys(photoRestoreSelection).filter((key) => photoRestoreSelection[key]).length} seleccionadas en total`
                    : ''}
                </Typography>
              </Paper>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: '330px minmax(0, 1fr)' },
                  gap: 1.25,
                  alignItems: 'stretch',
                  minHeight: 0,
                  flex: 1,
                }}
              >
                <AppFormStack
                  sx={{
                    minWidth: 0,
                    minHeight: 0,
                    height: '100%',
                    p: 1.25,
                    border: `1px solid ${colors.managementBorderMuted}`,
                    borderRadius: 1.25,
                    bgcolor: colors.white,
                  }}
                >
              <Typography sx={{ color: colors.blue1, fontSize: 14, fontWeight: 600 }}>
                Filtros y actividades
              </Typography>
              <AppSearchField
                fullWidth
                label="Filtrar por palabra o frase"
                value={photoKeywordFilter}
                onChange={(event) => setPhotoKeywordFilter(event.target.value)}
                helperText={
                  photoKeywordQuery
                    ? `Mostrando ${filteredSelectablePhotoCandidates.length} de ${selectablePhotoCandidates.length} imágenes candidatas`
                    : `${selectablePhotoCandidates.length} imágenes candidatas`
                }
                InputProps={{
                  endAdornment: photoKeywordFilter ? (
                    <InputAdornment position="end">
                      <AppIconButton
                        size="small"
                        onClick={() => setPhotoKeywordFilter('')}
                        aria-label="Limpiar filtro fotográfico"
                        sx={{ color: colors.slate500 }}
                      >
                        <Clear fontSize="small" />
                      </AppIconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: '1fr' },
                  gap: 1.5,
                }}
              >
                <AppTextField
                  select
                  size="small"
                  label="Frente"
                  value={photoSelectFrontFilter}
                  onChange={(event) => {
                    setPhotoSelectFrontFilter(String(event.target.value || ''));
                    setPhotoSelectModuleFilter('');
                    setPhotoSelectActivityFilter('');
                  }}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {photoSelectFrontOptions.map((front) => (
                    <MenuItem key={`photo-select-front-${front}`} value={front}>{front}</MenuItem>
                  ))}
                </AppTextField>
                <AppTextField
                  select
                  size="small"
                  label="Módulo"
                  value={photoSelectModuleFilter}
                  onChange={(event) => {
                    setPhotoSelectModuleFilter(String(event.target.value || ''));
                    setPhotoSelectActivityFilter('');
                  }}
                >
                  <MenuItem value="">Todas</MenuItem>
                  {photoSelectModuleOptions.length === 0 ? (
                    <MenuItem value="__no-modules" disabled>Sin módulos identificados</MenuItem>
                  ) : photoSelectModuleOptions.map((module) => (
                    <MenuItem key={`photo-module-${module}`} value={module}>
                      {module}
                    </MenuItem>
                  ))}
                </AppTextField>
              </Box>
              {photoSelectModuleFilter ? (
                <AppTextField
                  select
                  label="Trabajo realizado"
                  value={photoSelectActivityFilter}
                  onChange={(event) => setPhotoSelectActivityFilter(String(event.target.value || ''))}
                >
                  <MenuItem value="">
                    {photoSelectModuleFilter === PHOTO_MODULE_OTHER
                      ? 'Todos los otros trabajos'
                      : 'Todos los trabajos del módulo'}
                  </MenuItem>
                  {photoActivitySuggestions.map((activity) => (
                    <MenuItem key={`photo-module-activity-${activity.key}`} value={activity.key}>
                      {activity.label} · {activity.imageCount} imágenes
                    </MenuItem>
                  ))}
                </AppTextField>
              ) : null}
              <Paper
                variant="outlined"
                sx={{
                  p: 1,
                  borderColor: colors.managementBorderMuted,
                  bgcolor: colors.managementPanelBgSoft,
                  borderRadius: 1.25,
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: colors.blue1 }}>
                      Actividades relevantes
                    </Typography>
                    <Typography sx={{ fontSize: 11.5, color: colors.slate500 }}>
                      Coincidencias frecuentes según las imágenes del rango y los filtros activos.
                    </Typography>
                  </Box>
                  {photoSelectActivityFilter ? (
                    <AppButton
                      size="small"
                      variant="text"
                      onClick={() => setPhotoSelectActivityFilter('')}
                      sx={{ flexShrink: 0 }}
                    >
                      Ver todas
                    </AppButton>
                  ) : null}
                </Stack>
                {photoActivitySuggestionSections.length === 0 ? (
                  <Typography sx={{ py: 1, fontSize: 12.5, color: colors.slate500 }}>
                    No hay actividades para los filtros actuales.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {photoActivitySuggestionSections.map((section) => (
                      <Box key={`photo-activity-section-${section.front}`} sx={{ minWidth: 0 }}>
                        <Typography sx={{ mb: 0.5, fontSize: 11.5, color: colors.managementTextMuted, fontWeight: 600 }}>
                          {section.front}
                        </Typography>
                        <Stack spacing={0.8}>
                          {section.groups.map((group) => (
                            <Box key={`photo-activity-subgroup-${section.front}-${group.label}`} sx={{ minWidth: 0 }}>
                              <Typography sx={{ mb: 0.45, fontSize: 10.8, color: colors.slate500, fontWeight: 500 }}>
                                {group.label}
                              </Typography>
                              <Box
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: '1fr' },
                                  gap: 0.75,
                                }}
                              >
                                {group.activities.map((activity) => {
                                  const selected = photoSelectActivityFilter === activity.key;
                                  return (
                                    <Box
                                      key={`photo-activity-${activity.key}`}
                                      component="button"
                                      type="button"
                                      onClick={() => setPhotoSelectActivityFilter(selected ? '' : activity.key)}
                                      sx={{
                                        width: '100%',
                                        minWidth: 0,
                                        p: 0.75,
                                        borderRadius: 1,
                                        border: selected ? `1px solid ${colors.blue600}` : `1px solid ${colors.managementBorder}`,
                                        bgcolor: selected ? colors.blue100 : colors.white,
                                        color: colors.slate900,
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        boxShadow: selected ? `0 0 0 1px ${alpha(colors.blue600, 0.16)}` : 'none',
                                        '&:hover': { borderColor: colors.blue600, bgcolor: selected ? colors.blue100 : colors.blue50 },
                                      }}
                                    >
                                      <Typography sx={{ fontSize: 12.25, fontWeight: 600 }} noWrap title={activity.label}>
                                        {activity.label}
                                      </Typography>
                                      <Typography sx={{ mt: 0.25, fontSize: 11.5, color: colors.slate600 }}>
                                        {activity.imageCount} img · {activity.reportCount} rep · {activity.crewCount} cuadr.
                                        {activity.selectedCount ? ` · ${activity.selectedCount} sel.` : ''}
                                      </Typography>
                                    </Box>
                                  );
                                })}
                              </Box>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
                </AppFormStack>
                <Stack spacing={0.75} sx={{ minWidth: 0, minHeight: 0 }}>
              <TableContainer
                sx={{
                  border: `1px solid ${colors.managementBorder}`,
                  borderRadius: 1.25,
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                  bgcolor: colors.white,
                }}
              >
                <Table
                  size="small"
                  stickyHeader
                  sx={{
                    '& .MuiTableCell-root': {
                      borderColor: colors.managementBorderMuted,
                      color: colors.slate800,
                      fontSize: 13.5,
                    },
                    '& .MuiTableBody-root .MuiTableCell-root': {
                      py: 0.65,
                    },
                    '& .MuiTableHead-root .MuiTableCell-root': {
                      bgcolor: colors.managementTableHead,
                      color: colors.blue1,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    },
                    '& .MuiTableBody-root .MuiTableRow-root': {
                      transition: 'background-color 140ms ease',
                    },
                    '& .MuiTableBody-root .MuiTableRow-root:hover': {
                      bgcolor: colors.managementTableHover,
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 46 }} />
                      <TableCell>Fecha</TableCell>
                      <TableCell>Vista</TableCell>
                      <TableCell>Frente</TableCell>
                      <TableCell>Reporte</TableCell>
                      <TableCell>Cuadrilla</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSelectablePhotoCandidates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ py: 3, textAlign: 'center', color: colors.slate500 }}>
                          No hay imágenes que coincidan con el filtro.
                        </TableCell>
                      </TableRow>
                    ) : filteredSelectablePhotoCandidates.map((item) => {
                      const key = String(item.key || '').trim();
                      const reportBadgeColors = getPhotoReportBadgeColors(item);
                      return (
                        <TableRow
                          key={`select-photo-${key}`}
                          selected={Boolean(photoRestoreSelection[key])}
                          sx={{ '&.Mui-selected, &.Mui-selected:hover': { bgcolor: colors.blue50 } }}
                        >
                          <TableCell padding="checkbox">
                            <AppCheckbox
                              checked={Boolean(photoRestoreSelection[key])}
                              onChange={(event) => {
                                const checked = event.target.checked;
	                                setPhotoRestoreSelection((prev) => {
	                                  const next = { ...prev };
	                                  if (checked) next[key] = true;
	                                  else delete next[key];
	                                  return next;
	                                });
	                                setPhotoRestoreSelectionOrder((prev) => {
	                                  const withoutKey = prev.filter((itemKey) => itemKey !== key);
	                                  return checked ? [...withoutKey, key] : withoutKey;
	                                });
	                              }}
	                            />
                          </TableCell>
                          <TableCell>{formatDate(item.date) || '-'}</TableCell>
                          <TableCell>
                            {photoEvidencePreviewByKey[key] ? (
                              <Box
                                component="button"
                                type="button"
                                onClick={() => setPhotoZoomEvidenceKey(key)}
                                aria-label="Ampliar imagen"
                                sx={{
                                  p: 0,
                                  border: 0,
                                  bgcolor: 'transparent',
                                  cursor: 'zoom-in',
                                  display: 'block',
                                }}
                              >
                                <Box
                                component="img"
                                src={photoEvidencePreviewByKey[key]}
                                alt={item.name || 'Imagen'}
                                sx={{
                                  width: 112,
                                  height: 72,
                                  objectFit: 'cover',
                                  borderRadius: 0.75,
                                  border: `1px solid ${colors.slate300}`,
                                  bgcolor: colors.slate200,
                                }}
                              />
                              </Box>
                            ) : (
                              <Box
                                component="button"
                                type="button"
                                onClick={() => setPhotoZoomEvidenceKey(key)}
                                aria-label="Ampliar imagen"
                                sx={{
                                  width: 112,
                                  height: 72,
                                  borderRadius: 0.75,
                                  border: `1px solid ${colors.slate300}`,
                                  bgcolor: colors.slate200,
                                  cursor: 'zoom-in',
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell>{item.front || '-'}</TableCell>
                          <TableCell>
                            <Box
                              component="span"
                              title={item.reportNo ? `N°${item.reportNo}` : (item.reportId || '-')}
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 74,
                                px: 1,
                                py: 0.45,
                                borderRadius: 1,
                                border: `1px solid ${reportBadgeColors.border}`,
                                bgcolor: reportBadgeColors.background,
                                color: reportBadgeColors.text,
                                fontWeight: 600,
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {getPhotoReportShortLabel(item)}
                            </Box>
                          </TableCell>
                          <TableCell>{item.crew || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            px: { xs: 1.5, sm: 2.25 },
            py: 1.25,
            gap: 1,
            borderTop: `1px solid ${colors.managementBorderMuted}`,
            bgcolor: colors.white,
          }}
        >
          <AppButton variant="outlined" onClick={() => setPhotoRestoreDialogOpen(false)}>Cancelar</AppButton>
          <AppButton
            variant="contained"
            onClick={restoreSelectedPhotoEvidence}
          >
            Aplicar selección
          </AppButton>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(photoZoomEvidenceKey)}
        onClose={() => setPhotoZoomEvidenceKey('')}
        maxWidth={false}
        sx={{
          '& .MuiDialog-paper': {
            width: { xs: 'calc(100vw - 16px)', sm: '94vw' },
            height: { xs: 'calc(100dvh - 16px)', sm: '94vh' },
            maxWidth: '94vw',
            maxHeight: '94vh',
            m: { xs: 1, sm: 0 },
            borderRadius: 2,
            border: `1px solid ${colors.managementBorder}`,
            bgcolor: colors.white,
            boxShadow: '0 20px 60px rgba(0, 26, 51, 0.22)',
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle
          sx={{
            px: { xs: 1.5, sm: 2.25 },
            py: 1.35,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            borderBottom: `1px solid ${colors.managementBorderMuted}`,
          }}
        >
          <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                color: colors.blue600,
                bgcolor: colors.blue50,
              }}
            >
              <PhotoLibraryOutlined sx={{ fontSize: 20 }} />
            </Box>
            <Typography component="span" sx={{ color: colors.blue1, fontSize: { xs: 17, sm: 18 }, fontWeight: 600, lineHeight: 1.25 }} noWrap>
              Vista ampliada
            </Typography>
          </Stack>
          <AppIconButton
            size="small"
            onClick={() => setPhotoZoomEvidenceKey('')}
            aria-label="Cerrar vista ampliada"
            title="Cerrar"
            sx={{ color: colors.slate500, flexShrink: 0 }}
          >
            <Clear fontSize="small" />
          </AppIconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(280px, 340px)' },
            gridTemplateRows: { xs: 'minmax(42vh, 1fr) auto', md: 'minmax(0, 1fr)' },
            gap: { xs: 1, md: 1.5 },
            p: { xs: 1, sm: 1.5 },
            bgcolor: colors.managementPageBg,
            overflow: { xs: 'auto', md: 'hidden' },
          }}
        >
          <Box
            sx={{
              minHeight: 0,
              bgcolor: colors.slate900,
              borderRadius: 1.5,
              border: `1px solid ${colors.slate800}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {photoZoomEvidenceKey && photoEvidencePreviewByKey[photoZoomEvidenceKey] ? (
              <Box
                component="img"
                src={photoEvidencePreviewByKey[photoZoomEvidenceKey]}
                alt={zoomPhotoCandidate?.name || 'Imagen'}
                sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Typography sx={{ color: colors.slate300 }}>Cargando imagen...</Typography>
            )}
            {zoomPhotoList.length > 1 ? (
              <>
                <AppIconButton
                  onClick={() => goToZoomPhoto(-1)}
                  aria-label="Foto anterior"
                  sx={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    bgcolor: alpha(colors.slate900, 0.62),
                    color: colors.white,
                    '&:hover': { bgcolor: alpha(colors.slate900, 0.82) },
                  }}
                >
                  <ChevronLeft />
                </AppIconButton>
                <AppIconButton
                  onClick={() => goToZoomPhoto(1)}
                  aria-label="Foto siguiente"
                  sx={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    bgcolor: alpha(colors.slate900, 0.62),
                    color: colors.white,
                    '&:hover': { bgcolor: alpha(colors.slate900, 0.82) },
                  }}
                >
                  <ChevronRight />
                </AppIconButton>
              </>
            ) : null}
          </Box>
          <Stack
            spacing={1.1}
            sx={{
              minWidth: 0,
              minHeight: 0,
              p: { xs: 1.25, sm: 1.5 },
              borderRadius: 1.5,
              border: `1px solid ${colors.managementBorderMuted}`,
              bgcolor: colors.white,
              overflowY: 'auto',
            }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between" sx={{ pb: 0.75, borderBottom: `1px solid ${colors.managementBorderMuted}` }}>
              <AppIconButton
                size="small"
                onClick={() => goToZoomPhoto(-1)}
                disabled={zoomPhotoList.length <= 1}
                aria-label="Foto anterior"
              >
                <ChevronLeft />
              </AppIconButton>
              <Typography sx={{ fontSize: 12.5, color: colors.managementTextMuted, fontWeight: 500 }}>
                {zoomPhotoIndex >= 0 ? `${zoomPhotoIndex + 1} de ${zoomPhotoList.length}` : `1 de ${Math.max(1, zoomPhotoList.length)}`}
              </Typography>
              <AppIconButton
                size="small"
                onClick={() => goToZoomPhoto(1)}
                disabled={zoomPhotoList.length <= 1}
                aria-label="Foto siguiente"
              >
                <ChevronRight />
              </AppIconButton>
            </Stack>
            <AppButton
	              variant={photoRestoreSelection[photoZoomEvidenceKey] ? 'outlined' : 'contained'}
	              onClick={() => {
	                const checked = !photoRestoreSelection[photoZoomEvidenceKey];
	                setPhotoRestoreSelection((prev) => {
	                  const next = { ...prev };
	                  if (checked) next[photoZoomEvidenceKey] = true;
	                  else delete next[photoZoomEvidenceKey];
	                  return next;
	                });
	                setPhotoRestoreSelectionOrder((prevOrder) => {
	                  const withoutKey = prevOrder.filter((itemKey) => itemKey !== photoZoomEvidenceKey);
	                  return checked ? [...withoutKey, photoZoomEvidenceKey] : withoutKey;
	                });
	              }}
            >
              {photoRestoreSelection[photoZoomEvidenceKey] ? 'Quitar de selección' : 'Seleccionar imagen'}
            </AppButton>
            <Box sx={{ borderTop: `1px solid ${colors.managementBorderMuted}`, pt: 1 }}>
              <Typography sx={{ fontSize: 12, color: colors.managementTextMuted, fontWeight: 500 }}>Frente</Typography>
              <Typography sx={{ color: colors.slate900, fontWeight: 400 }}>{zoomPhotoCandidate?.front || '-'}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, color: colors.managementTextMuted, fontWeight: 500 }}>Reporte</Typography>
              {zoomPhotoCandidate && zoomPhotoReportBadgeColors ? (
                <Box
                  component="span"
                  title={zoomPhotoCandidate.reportNo ? `N°${zoomPhotoCandidate.reportNo}` : (zoomPhotoCandidate.reportId || '-')}
                  sx={{
                    mt: 0.35,
                    display: 'inline-flex',
                    alignItems: 'center',
                    px: 1,
                    py: 0.45,
                    borderRadius: 1,
                    border: `1px solid ${zoomPhotoReportBadgeColors.border}`,
                    bgcolor: zoomPhotoReportBadgeColors.background,
                    color: zoomPhotoReportBadgeColors.text,
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  {getPhotoReportShortLabel(zoomPhotoCandidate)}
                </Box>
              ) : (
                <Typography sx={{ color: colors.slate900, fontWeight: 400 }}>-</Typography>
              )}
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, color: colors.managementTextMuted, fontWeight: 500 }}>Fecha</Typography>
              <Typography sx={{ color: colors.slate900, fontWeight: 400 }}>{formatDate(zoomPhotoCandidate?.date || '') || '-'}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, color: colors.managementTextMuted, fontWeight: 500 }}>Cuadrilla</Typography>
              <Typography sx={{ color: colors.slate900, fontWeight: 400 }}>{zoomPhotoCandidate?.crew || '-'}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, color: colors.managementTextMuted, fontWeight: 500 }}>Resumen</Typography>
              <Typography sx={{ color: colors.slate900, fontWeight: 400, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {zoomPhotoCandidate?.activitySummary || zoomPhotoCandidate?.reportTitle || '-'}
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
      <Dialog
        open={photoRangeDialogOpen}
        onClose={() => setPhotoRangeDialogOpen(false)}
        fullScreen={isMobile}
        fullWidth
        maxWidth="xs"
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: { xs: 0, sm: 2.2 },
            m: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: 'min(460px, calc(100% - 32px))' },
            maxHeight: { xs: '100%', sm: 'calc(100% - 32px)' },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: colors.slate900, pb: 0.9, px: { xs: 2, sm: 3 } }}>
          Seleccionar período
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 0.9, pb: 0.75, px: { xs: 1, sm: 2 } }}>
          <Stack spacing={0.4} alignItems="center">
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
              <DateCalendar
                value={photoTempEndDate || photoTempStartDate}
                onChange={(nextDate) => {
                  if (!nextDate) return;
                  if (!photoTempStartDate || (photoTempStartDate && photoTempEndDate)) {
                    setPhotoTempStartDate(nextDate);
                    setPhotoTempEndDate(null);
                    return;
                  }
                  if (nextDate < photoTempStartDate) {
                    setPhotoTempStartDate(nextDate);
                    setPhotoTempEndDate(photoTempStartDate);
                  } else {
                    setPhotoTempEndDate(nextDate);
                  }
                }}
                slots={{ day: RangeDay }}
                sx={{
                  mx: 'auto',
                  width: { xs: '100%', sm: 360 },
                  maxWidth: '100%',
                  '& .MuiPickersCalendarHeader-root': { px: 1, mb: 0.25 },
                  '& .MuiDayCalendar-header': { mb: 0.15 },
                  '& .MuiDayCalendar-weekContainer': { my: 0.1 },
                  '& .MuiPickersSlideTransition-root': { minHeight: { xs: 236, sm: 210 } },
                }}
              />
            </LocalizationProvider>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 1.5, sm: 2 }, py: 1 }}>
          <AppButton onClick={() => setPhotoRangeDialogOpen(false)}>Cancelar</AppButton>
          <AppButton
            onClick={() => {
              if (!photoTempStartDate || !photoTempEndDate) return;
              const nextStart = formatIsoFromDate(photoTempStartDate);
              const nextEnd = formatIsoFromDate(photoTempEndDate);
              setPhotoPeriodStartDate(nextStart);
              setPhotoPeriodEndDate(nextEnd);
              setPhotoCoverReportNo(formatPhotoReportNumberForPeriod(nextStart, nextEnd));
              setPhotoConfigDirty(true);
              setPhotoRangeDialogOpen(false);
            }}
            disabled={!photoTempStartDate || !photoTempEndDate}
            variant="contained"
            sx={{ fontWeight: 700, textTransform: 'none', px: 2.25 }}
          >
            Aplicar
          </AppButton>
        </DialogActions>
      </Dialog>
      <Dialog
        open={interferenceDialogOpen}
        onClose={() => {
          if (interferenceSaving) return;
          setInterferenceDialogOpen(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ fontWeight: 700, color: colors.gray900 }}>
          Crear interferencia
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <FormControl size="small" fullWidth>
              <InputLabel id="management-interference-front-label">Frente</InputLabel>
              <AppSelectControl
                labelId="management-interference-front-label"
                label="Frente"
                value={interferenceForm.workFront}
                onChange={(event) => updateInterferenceForm({ workFront: String(event.target.value || '') })}
              >
                {MANAGEMENT_WORK_FRONT_OPTIONS.map((front) => (
                  <MenuItem key={front} value={front}>{front}</MenuItem>
                ))}
              </AppSelectControl>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="management-interference-time-type-label">Tipo</InputLabel>
              <AppSelectControl
                labelId="management-interference-time-type-label"
                label="Tipo"
                value={interferenceForm.timeType}
                onChange={(event) => {
                  const nextType = String(event.target.value || 'Tiempo no contributivo');
                  const firstDetail = MANAGEMENT_TIME_REASON_OPTIONS[nextType]?.[0] || '';
                  updateInterferenceForm({ timeType: nextType, timeDetail: firstDetail });
                }}
              >
                {Object.keys(MANAGEMENT_TIME_REASON_OPTIONS).map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </AppSelectControl>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="management-interference-time-detail-label">Detalle tipo</InputLabel>
              <AppSelectControl
                labelId="management-interference-time-detail-label"
                label="Detalle tipo"
                value={interferenceForm.timeDetail}
                onChange={(event) => updateInterferenceForm({ timeDetail: String(event.target.value || '') })}
              >
                {detailTypeOptions.map((detail) => (
                  <MenuItem key={detail} value={detail}>{detail}</MenuItem>
                ))}
              </AppSelectControl>
            </FormControl>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <AppTextField
                size="small"
                label="Fecha"
                type="date"
                value={interferenceForm.date}
                onChange={(event) => updateInterferenceForm({ date: event.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <AppTextField
                size="small"
                label="Inicio interferencia"
                type="time"
                value={interferenceForm.startTime}
                onChange={(event) => updateInterferenceForm({ startTime: event.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <AppTextField
                size="small"
                label="Fin interferencia"
                type="time"
                value={interferenceForm.endTime}
                onChange={(event) => updateInterferenceForm({ endTime: event.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>

            <AppTextField
              size="small"
              label="Detalle / Observación / Nota"
              value={interferenceForm.note}
              onChange={(event) => updateInterferenceForm({ note: event.target.value })}
              multiline
              minRows={4}
              fullWidth
            />

            <MultiFileDropzone
              files={interferenceFiles}
              accept="image/*"
              disabled={interferenceSaving}
              label="Arrastra y suelta las imágenes aquí"
              helperText="Puedes seleccionar varias imágenes"
              onFilesChange={setInterferenceFiles}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <AppButton
            onClick={() => {
              setInterferenceDialogOpen(false);
              resetInterferenceForm();
            }}
            disabled={interferenceSaving}
          >
            Cancelar
          </AppButton>
          <AppButton variant="contained" onClick={saveInterference} disabled={interferenceSaving}>
            {interferenceSaving ? 'Guardando...' : 'Guardar'}
          </AppButton>
        </DialogActions>
      </Dialog>
      <Dialog open={equipmentModalOpen} onClose={() => setEquipmentModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{equipmentModalMode === 'edit' ? 'Editar equipo' : 'Crear equipo'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Box>
              <Typography sx={{ mb: 0.6, fontSize: 12, fontWeight: 700, color: colors.slate500 }}>
                Tipo
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 1,
                }}
              >
                {(['MAYOR', 'MENOR'] as EquipmentKind[]).map((kind) => {
                  const selected = (equipmentDraft?.equipment_kind || 'MAYOR') === kind;
                  return (
                    <AppButton
                      key={kind}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        if (selected) return;
                        setEquipmentDraft((prev) => prev ? { ...prev, equipment_kind: kind, equipment_name: '' } : prev);
                        setEquipmentNameCustomMode(false);
                      }}
                      sx={{
                        minHeight: 40,
                        borderRadius: 1,
                        border: `1px solid ${selected ? colors.blue600 : colors.slate300}`,
                        bgcolor: selected ? colors.blue600 : colors.slate100,
                        color: selected ? colors.white : colors.slate600,
                        fontWeight: 700,
                        '&:hover': {
                          bgcolor: selected ? colors.blue700 : colors.slate200,
                          borderColor: selected ? colors.blue700 : colors.slate400,
                        },
                      }}
                    >
                      {kind}
                    </AppButton>
                  );
                })}
              </Box>
            </Box>
            <FormControl fullWidth size="small">
              <InputLabel id="equipment-name-select-label">Nombre (máquina/equipo)</InputLabel>
              <AppSelectControl
                labelId="equipment-name-select-label"
                label="Nombre (máquina/equipo)"
                value={equipmentNameCustomMode ? '__OTHER__' : String(equipmentDraft?.equipment_name || '').trim().toUpperCase()}
                onChange={(e) => {
                  const next = String(e.target.value || '');
                  if (next === '__OTHER__') {
                    setEquipmentNameCustomMode(true);
                    setEquipmentDraft((prev) => prev ? { ...prev, equipment_name: '' } : prev);
                    return;
                  }
                  setEquipmentNameCustomMode(false);
                  setEquipmentDraft((prev) => prev ? { ...prev, equipment_name: next.toUpperCase() } : prev);
                }}
                sx={{
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.slate300 },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.slate400 },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.blue900 },
                }}
              >
                <MenuItem value="" disabled>Selecciona un equipo</MenuItem>
                {Array.from(
                  new Set(
                    [
                      ...equipmentRows
                        .filter((row) => row.equipment_kind === (equipmentDraft?.equipment_kind || 'MAYOR'))
                        .map((row) => String(row.equipment_name || '').trim().toUpperCase())
                        .filter(Boolean),
                      String(equipmentDraft?.equipment_name || '').trim().toUpperCase(),
                    ].filter(Boolean)
                  )
                )
                  .sort((a, b) => a.localeCompare(b, 'es'))
                  .map((name) => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                <MenuItem value="__OTHER__">OTRO...</MenuItem>
              </AppSelectControl>
            </FormControl>
            {equipmentNameCustomMode ? (
              <AppTextField
                label="Escribe nuevo equipo"
                size="small"
                fullWidth
                value={String(equipmentDraft?.equipment_name || '')}
                onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, equipment_name: String(e.target.value || '').toUpperCase() } : prev)}
              />
            ) : null}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1.2fr) minmax(0, 1fr)' },
                gap: 1,
              }}
            >
              <AppTextField
                  label="Patente / Nº / Serie"
                  size="small"
                  fullWidth
                  value={String(equipmentDraft?.patent || '')}
                  onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, patent: String(e.target.value || '').toLowerCase() } : prev)}
                  inputProps={{ style: { textTransform: 'uppercase' } }}
                />
              <AppTextField
                label="Aplicar desde"
                size="small"
                type="date"
                fullWidth
                value={String(equipmentEffectiveDate || equipmentDate || '').slice(0, 10)}
                onChange={(e) => setEquipmentEffectiveDate(String(e.target.value || '').slice(0, 10))}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' },
                gap: 1,
                alignItems: 'center',
              }}
            >
              <FormControlLabel
                sx={{
                  m: 0,
                  minHeight: 36,
                  px: 0.5,
                  justifyContent: 'center',
                  borderRadius: 1,
                  bgcolor: Boolean(equipmentDraft?.is_operational) ? colors.managementFlagSoft : 'transparent',
                }}
                control={
                  <AppCheckbox
                    checked={Boolean(equipmentDraft?.is_operational)}
                    sx={{ color: colors.managementCheckbox, '&.Mui-checked': { color: colors.blue10 } }}
                    onChange={(e) => setEquipmentDraft((prev) => prev ? {
                      ...prev,
                      is_operational: e.target.checked,
                      in_maintenance: e.target.checked ? false : (prev.in_maintenance || (!prev.in_accreditation && !prev.in_breakdown)),
                      in_accreditation: e.target.checked ? false : prev.in_accreditation,
                      in_breakdown: e.target.checked ? false : prev.in_breakdown,
                      return_date: e.target.checked ? null : prev.return_date,
                    } : prev)}
                  />
                }
                label="Operativa"
              />
              <FormControlLabel
                sx={{
                  m: 0,
                  minHeight: 36,
                  px: 0.5,
                  justifyContent: 'center',
                  borderRadius: 1,
                  bgcolor: Boolean(equipmentDraft?.in_maintenance) ? colors.managementFlagSoft : 'transparent',
                }}
                control={<AppCheckbox sx={{ color: colors.managementCheckbox, '&.Mui-checked': { color: colors.blue10 } }} checked={Boolean(equipmentDraft?.in_maintenance)} disabled={Boolean(equipmentDraft?.is_operational)} onChange={() => setEquipmentDraft((prev) => prev ? { ...prev, in_maintenance: true, in_accreditation: false, in_breakdown: false } : prev)} />}
                label="Mantención"
              />
              <FormControlLabel
                sx={{
                  m: 0,
                  minHeight: 36,
                  px: 0.5,
                  justifyContent: 'center',
                  borderRadius: 1,
                  bgcolor: Boolean(equipmentDraft?.in_accreditation) ? colors.managementFlagSoft : 'transparent',
                }}
                control={<AppCheckbox sx={{ color: colors.managementCheckbox, '&.Mui-checked': { color: colors.blue10 } }} checked={Boolean(equipmentDraft?.in_accreditation)} disabled={Boolean(equipmentDraft?.is_operational)} onChange={() => setEquipmentDraft((prev) => prev ? { ...prev, in_maintenance: false, in_accreditation: true, in_breakdown: false } : prev)} />}
                label="Acreditación"
              />
              <FormControlLabel
                sx={{
                  m: 0,
                  minHeight: 36,
                  px: 0.5,
                  justifyContent: 'center',
                  borderRadius: 1,
                  bgcolor: Boolean(equipmentDraft?.in_breakdown) ? colors.managementFlagSoft : 'transparent',
                }}
                control={<AppCheckbox sx={{ color: colors.managementCheckbox, '&.Mui-checked': { color: colors.blue10 } }} checked={Boolean(equipmentDraft?.in_breakdown)} disabled={Boolean(equipmentDraft?.is_operational)} onChange={() => setEquipmentDraft((prev) => prev ? { ...prev, in_maintenance: false, in_accreditation: false, in_breakdown: true } : prev)} />}
                label="Panne"
              />
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                gap: 1,
                alignItems: 'center',
              }}
            >
              <AppTextField
                label="Cantidad"
                size="small"
                type="number"
                inputProps={{ step: '0.5', min: '0.5' }}
                value={equipmentDraft?.quantity === null || equipmentDraft?.quantity === undefined ? '1' : String(equipmentDraft?.quantity)}
                onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, quantity: String(e.target.value).trim() === '' ? 1 : toNumber(e.target.value || 1) } : prev)}
              />
              <AppTextField
                label="CANALETAS"
                size="small"
                type="number"
                inputProps={{ step: '0.5', min: '0' }}
                value={equipmentDraft?.canaletas_qty === null || equipmentDraft?.canaletas_qty === undefined ? '0' : String(equipmentDraft?.canaletas_qty)}
                onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, canaletas_qty: String(e.target.value).trim() === '' ? 0 : toNumber(e.target.value || 0) } : prev)}
              />
              <AppTextField
                label="PISCINAS"
                size="small"
                type="number"
                inputProps={{ step: '0.5', min: '0' }}
                value={equipmentDraft?.piscinas_qty === null || equipmentDraft?.piscinas_qty === undefined ? '0' : String(equipmentDraft?.piscinas_qty)}
                onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, piscinas_qty: String(e.target.value).trim() === '' ? 0 : toNumber(e.target.value || 0) } : prev)}
              />
            </Box>
            <AppTextField
              label="Kilometraje"
              size="small"
              type="number"
              inputProps={{ step: '1', min: '0' }}
              value={equipmentDraft?.mileage_km === null || equipmentDraft?.mileage_km === undefined ? '' : String(equipmentDraft?.mileage_km)}
              onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, mileage_km: String(e.target.value).trim() === '' ? null : toNumber(e.target.value || 0) } : prev)}
            />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1,
              }}
            >
              <AppTextField
                label="Ingreso"
                size="small"
                type="date"
                fullWidth
                value={String(equipmentDraft?.entry_date || '').slice(0, 10)}
                onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, entry_date: String(e.target.value || '').slice(0, 10) || null } : prev)}
                InputLabelProps={{ shrink: true }}
              />
              <AppTextField
                label="Salida / Devolución"
                size="small"
                type="date"
                fullWidth
                value={String(equipmentDraft?.return_date || '').slice(0, 10)}
                onChange={(e) => setEquipmentDraft((prev) => {
                  if (!prev) return prev
                  const returnDate = String(e.target.value || '').slice(0, 10) || null
                  return returnDate
                    ? { ...prev, return_date: returnDate, is_operational: false, in_maintenance: false, in_accreditation: false, in_breakdown: false }
                    : { ...prev, return_date: null }
                })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <AppTextField
              label="Notas"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={String(equipmentDraft?.notes || '')}
              onChange={(e) => setEquipmentDraft((prev) => prev ? { ...prev, notes: e.target.value } : prev)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <AppButton onClick={() => setEquipmentModalOpen(false)}>Cancelar</AppButton>
          <AppButton variant="contained" onClick={saveEquipmentModal} disabled={!equipmentModalHasChanges || equipmentSaving}>
            {equipmentSaving ? 'Guardando...' : 'Guardar'}
          </AppButton>
        </DialogActions>
      </Dialog>
      <Dialog
        open={reportFrontDialogOpen}
        onClose={() => setReportFrontDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{reportFrontDraft.id ? 'Editar frente / UDR' : 'Nuevo frente / UDR'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25} sx={{ pt: 0.5 }}>
            <AppTextField
              label="Nombre"
              size="small"
              fullWidth
              value={reportFrontDraft.name}
              onChange={(e) => updateReportFrontDraft({ name: String(e.target.value || '').toUpperCase() })}
            />
            <AppTextField
              label="Prefijo del título"
              size="small"
              fullWidth
              value={reportFrontDraft.title_prefix}
              onChange={(e) => updateReportFrontDraft({ title_prefix: String(e.target.value || '').toUpperCase() })}
            />
            <AppTextField
              label="Código"
              size="small"
              fullWidth
              value={reportFrontDraft.code}
              onChange={(e) => updateReportFrontDraft({ code: String(e.target.value || '').toUpperCase() })}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
              <AppTextField
                select
                label="Tipo"
                size="small"
                value={reportFrontDraft.type}
                onChange={(e) => updateReportFrontDraft({ type: String(e.target.value || 'udr') as ReportFrontDraft['type'] })}
              >
                <MenuItem value="udr">UDR</MenuItem>
                <MenuItem value="base">Contrato base</MenuItem>
                <MenuItem value="other">Otro</MenuItem>
              </AppTextField>
              <AppTextField
                select
                label="Modo correlativo"
                size="small"
                value={reportFrontDraft.sequence_mode}
                onChange={(e) => updateReportFrontDraft({ sequence_mode: String(e.target.value || 'incremental') as ReportFrontDraft['sequence_mode'] })}
              >
                <MenuItem value="incremental">Incremental</MenuItem>
                <MenuItem value="date_anchor">Por fecha</MenuItem>
              </AppTextField>
            </Box>
            {reportFrontDraft.sequence_mode === 'incremental' ? (
              <AppTextField
                label="Próximo número"
                size="small"
                type="number"
                inputProps={{ min: 1, step: 1 }}
                value={reportFrontDraft.next_sequence_no}
                onChange={(e) => updateReportFrontDraft({ next_sequence_no: String(e.target.value || '') })}
              />
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                <AppTextField
                  label="Fecha ancla"
                  size="small"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={reportFrontDraft.date_anchor}
                  onChange={(e) => updateReportFrontDraft({ date_anchor: String(e.target.value || '') })}
                />
                <AppTextField
                  label="Número en fecha ancla"
                  size="small"
                  type="number"
                  inputProps={{ min: 1, step: 1 }}
                  value={reportFrontDraft.date_anchor_sequence_no}
                  onChange={(e) => updateReportFrontDraft({ date_anchor_sequence_no: String(e.target.value || '') })}
                />
              </Box>
            )}
            <FormControlLabel
              control={
                <AppCheckbox
                  checked={reportFrontDraft.is_active}
                  onChange={(e) => updateReportFrontDraft({ is_active: e.target.checked })}
                />
              }
              label="Activo"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <AppButton onClick={() => setReportFrontDialogOpen(false)}>Cancelar</AppButton>
          <AppButton variant="contained" onClick={saveReportFront} disabled={reportFrontSaving}>
            {reportFrontSaving ? 'Guardando...' : 'Guardar'}
          </AppButton>
        </DialogActions>
      </Dialog>
      <ConfirmActionDialog
        open={!!dailyActivitiesConfirmFront}
        title={dailyActivitiesConfirmFront?.include_in_daily_activities ? 'Desactivar inclusión' : 'Activar inclusión'}
        message={
          dailyActivitiesConfirmFront?.include_in_daily_activities
            ? 'Se dejará de incluir en Reporte diario.'
            : 'Se incluirá en Reporte diario.'
        }
        detail={String(dailyActivitiesConfirmFront?.name || dailyActivitiesConfirmFront?.title_prefix || '').trim()}
        confirmLabel={dailyActivitiesConfirmFront?.include_in_daily_activities ? 'Desactivar' : 'Activar'}
        cancelLabel="Cancelar"
        loading={reportFrontSaving}
        variant={dailyActivitiesConfirmFront?.include_in_daily_activities ? 'warning' : 'info'}
        onCancel={() => setDailyActivitiesConfirmFront(null)}
        onConfirm={toggleReportFrontDailyActivities}
      />
      <Dialog
        open={Boolean(equipmentPropagationConfirm)}
        onClose={() => !equipmentSaving && setEquipmentPropagationConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Existen fechas posteriores</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Typography sx={{ color: colors.slate700 }}>
              Ya existen registros de equipos posteriores al {formatSpanishShortDate(equipmentPropagationConfirm?.targetDate || '')}.
            </Typography>
            <Typography sx={{ color: colors.slate600, fontSize: 14 }}>
              Puedes guardar el cambio solo en esta fecha o aplicarlo también al mismo equipo en las fechas posteriores. Los demás equipos no se modificarán.
            </Typography>
            <Typography sx={{ color: colors.slate500, fontSize: 13 }}>
              Fechas posteriores: {(equipmentPropagationConfirm?.futureDates || []).map(formatSpanishShortDate).join(', ')}.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <AppButton onClick={() => setEquipmentPropagationConfirm(null)} disabled={equipmentSaving}>Cancelar</AppButton>
          <AppButton
            variant="outlined"
            disabled={equipmentSaving || !equipmentPropagationConfirm}
            onClick={async () => {
              const pending = equipmentPropagationConfirm;
              if (!pending) return;
              const ok = await persistEquipmentRows(pending.rows, pending.successMessage, pending.targetDate, {
                identityKeys: pending.identityKeys,
              });
              if (ok) {
                setEquipmentPropagationConfirm(null);
                setEquipmentModalOpen(false);
                setEquipmentDraft(null);
                setEditingEquipmentIndex(null);
              }
            }}
          >
            Solo esta fecha
          </AppButton>
          <AppButton
            variant="contained"
            disabled={equipmentSaving || !equipmentPropagationConfirm}
            onClick={async () => {
              const pending = equipmentPropagationConfirm;
              if (!pending) return;
              const ok = await persistEquipmentRows(pending.rows, pending.successMessage, pending.targetDate, {
                propagateToFuture: true,
                identityKeys: pending.identityKeys,
              });
              if (ok) {
                setEquipmentPropagationConfirm(null);
                setEquipmentModalOpen(false);
                setEquipmentDraft(null);
                setEditingEquipmentIndex(null);
              }
            }}
          >
            Aplicar a fechas posteriores
          </AppButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
