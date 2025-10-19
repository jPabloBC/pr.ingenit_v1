import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, 'dd/MM/yyyy', { locale: es })
}

export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, 'dd/MM/yyyy HH:mm', { locale: es })
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP'
  }).format(amount)
}

export function formatRut(rut: string): string {
  // Remove all non-alphanumeric characters
  const cleanRut = rut.replace(/[^0-9kK]/g, '')
  
  if (cleanRut.length < 2) return rut
  
  // Separate the verification digit
  const body = cleanRut.slice(0, -1)
  const dv = cleanRut.slice(-1).toUpperCase()
  
  // Add dots to the body
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  
  return `${formattedBody}-${dv}`
}

export function validateRut(rut: string): boolean {
  const cleanRut = rut.replace(/[^0-9kK]/g, '')
  
  if (cleanRut.length < 2) return false
  
  const body = cleanRut.slice(0, -1)
  const dv = cleanRut.slice(-1).toUpperCase()
  
  let sum = 0
  let multiplier = 2
  
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  
  const remainder = sum % 11
  const calculatedDv = 11 - remainder
  
  let expectedDv: string
  if (calculatedDv === 11) expectedDv = '0'
  else if (calculatedDv === 10) expectedDv = 'K'
  else expectedDv = calculatedDv.toString()
  
  return dv === expectedDv
}

export function calculateWorkingHours(checkIn: Date, checkOut: Date): number {
  const diffInMs = checkOut.getTime() - checkIn.getTime()
  return Math.round((diffInMs / (1000 * 60 * 60)) * 100) / 100
}

export function calculateOvertimeHours(totalHours: number, regularHours: number = 8): number {
  return Math.max(0, totalHours - regularHours)
}

export function getDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = []
  const currentDate = new Date(startDate)
  
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  return dates
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // Sunday or Saturday
}

export function getDayOfWeek(date: Date): string {
  return format(date, 'EEEE', { locale: es })
}

export function getCurrentMonth(): { month: number; year: number } {
  const now = new Date()
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear()
  }
}