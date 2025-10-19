// Enums manuales equivalentes a los de Prisma, para uso con Supabase
export enum UserRole {
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  SUPERADMIN = 'SUPERADMIN',
}

export enum IndustryType {
  TECHNOLOGY = 'TECHNOLOGY',
  CONSTRUCTION = 'CONSTRUCTION',
  HEALTHCARE = 'HEALTHCARE',
  EDUCATION = 'EDUCATION',
  OTHER = 'OTHER',
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
}

export enum PayrollStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  ERROR = 'ERROR',
}

export interface Employee {
  id: string
  rut: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  address?: string
  position: string
  salary: number
  hireDate: Date
  birthDate?: Date
  emergencyContact?: string
  companyId: string
  departmentId: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  department?: Department
  company?: Company
}

export interface Department {
  id: string
  name: string
  companyId: string
  createdAt: Date
  updatedAt: Date
  company?: Company
  employees?: Employee[]
}

export interface Company {
  id: string
  name: string
  rut: string
  address?: string
  phone?: string
  email?: string
  industry?: IndustryType
  createdAt: Date
  updatedAt: Date
  departments?: Department[]
  employees?: Employee[]
}

export interface Attendance {
  id: string
  employeeId: string
  date: Date
  checkIn?: Date
  checkOut?: Date
  hoursWorked?: number
  overtime?: number
  status: AttendanceStatus
  notes?: string
  createdAt: Date
  employee?: Employee
}

export interface EPPRecord {
  id: string
  employeeId: string
  itemName: string
  itemType: string
  deliveryDate: Date
  expiryDate?: Date
  quantity: number
  status: EPPStatus
  notes?: string
  createdAt: Date
  updatedAt: Date
  employee?: Employee
}

export interface Payroll {
  id: string
  companyId: string
  month: number
  year: number
  status: PayrollStatus
  createdAt: Date
  updatedAt: Date
  company?: Company
  payrollItems?: PayrollItem[]
}

export interface PayrollItem {
  id: string
  payrollId: string
  employeeId: string
  baseSalary: number
  overtime: number
  bonuses: number
  deductions: number
  totalGross: number
  totalNet: number
  payroll?: Payroll
  employee?: Employee
}

export interface Collaborator {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  position?: string;
  is_active: boolean;
}

