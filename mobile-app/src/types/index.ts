// Tipos compartidos con el proyecto principal
export enum UserRole {
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  SUPERADMIN = 'SUPERADMIN',
  HR_MANAGER = 'HR_MANAGER',
  SUPERVISOR = 'SUPERVISOR',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  ON_LEAVE = 'ON_LEAVE',
}

export enum EPPStatus {
  DELIVERED = 'DELIVERED',
  EXPIRED = 'EXPIRED',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
}

export enum PayrollStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  ERROR = 'ERROR',
}

export interface User {
  id: string
  email: string
  role: UserRole
  company_id?: string
  is_active: boolean
  created_at: string
  updated_at: string
  user_metadata?: {
    document?: string
    company_id?: string
  }
}

export interface Employee {
  id: string
  user_id: string
  company_id: string
  email: string
  first_name: string
  last_name: string
  document: string
  phone: string
  address: string
  position: string
  worker_type?: string
  salary: number
  birth_date: string
  hire_date: string
  emergency_contact: string
  upper_clothing_size: string
  lower_clothing_size: string
  shoe_size: string
  gender?: string
  photo_url?: string
  epp_details: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
  department?: Department
  company?: Company
}

export interface Department {
  id: string
  name: string
  description?: string
  company_id: string
  created_at: string
  updated_at: string
}

export interface Company {
  id: string
  name: string
  industry_type: string
  address: string
  phone: string
  email: string
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: string
  user_id: string
  date: string
  check_in?: string
  check_out?: string
  hours_worked?: number
  overtime?: number
  status: AttendanceStatus
  notes?: string
  created_at: string
  updated_at: string
  latitude_in?: number // Updated column name
  longitude_in?: number // Updated column name
  latitude_out?: number // New column
  longitude_out?: number // New column
  photo_url?: string
  local_time?: string
  local_time_out?: string
  device_id?: string
}

export interface EPPRecord {
  id: string
  employee_id: string
  item_name: string
  item_type: string
  delivery_date: string
  expiry_date?: string
  quantity: number
  status: EPPStatus
  notes?: string
  created_at: string
  updated_at: string
}

export interface PayrollRecord {
  id: string
  employee_id: string
  month: number
  year: number
  base_salary: number
  overtime_hours: number
  overtime_amount: number
  bonuses: number
  deductions: number
  net_salary: number
  status: PayrollStatus
  document_url?: string
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  read: boolean
  created_at: string
}

export interface AuthSession {
  user: User & { employee?: Employee }
  token: string
  expires: string
}

// Navigation types
export type RootStackParamList = {
  Login: undefined
  Main: undefined
  Dashboard: undefined
  Attendance: undefined
  EPP: undefined
  Documents: undefined
  Profile: undefined
  AttendanceDetail: { attendanceId: string }
  EPPDetail: { eppId: string }
  DocumentDetail: { documentId: string }
  AttendanceHistory: {
    history: {
      id: any;
      collaborator_id: any;
      check_in: any;
      check_out: any;
      status: any;
      latitude: any;
      longitude: any;
      photo_url: any;
      local_time: any;
      local_time_out: any;
      device_id: any;
    }[];
  };
}

export type TabParamList = {
  Dashboard: undefined
  Attendance: undefined
  EPP: undefined
  Documents: undefined
  Profile: undefined
}

export interface AttendanceQueryResult {
  id: string;
  collaborator_id: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  latitude_in: number | null; // Updated column name
  longitude_in: number | null; // Updated column name
  latitude_out: number | null; // New column
  longitude_out: number | null; // New column
  photo_url: string | null;
  local_time: string | null;
  local_time_out: string | null;
  device_id: string | null;
}