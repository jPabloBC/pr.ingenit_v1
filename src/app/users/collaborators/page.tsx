"use client"

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  CircularProgress,
  Container,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Card,
  CardContent,
  Autocomplete,
  Alert,
  MenuItem,
  Avatar,
  InputAdornment
} from '@mui/material'
import {
  Add,
  Edit,
  Delete,
  Upload,
  Download,
  Search,
  FilterList,
  Person,
  Email,
  Phone,
  Business,
  Warning,
  ViewList,
  ViewModule
} from '@mui/icons-material'
import { colors } from '@/theme/theme'
import { getSuggestedPositions, findSimilarPositions, isStandardPosition, validateCustomPosition, addCustomPosition, getPositionStats } from '@/lib/positionStandards'
import { IndustryType } from '@/types'
import CountryPhoneInput from '@/components/CountryPhoneInput'
import UserHeader from '@/components/layout/UserHeader'
import Aside from '@/components/layout/Aside'

interface Collaborator {
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
  worker_type?: string // New field for mining industry
  salary: number
  birth_date: string
  hire_date: string
  emergency_contact: string
  upper_clothing_size: string
  lower_clothing_size: string
  shoe_size: string
  gender?: string
  photo_url?: string
  epp_details: any
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function CollaboratorsPage() {
  // Handler para activar colaborador
  const handleActivateCollaborator = async (collaborator: Collaborator) => {
    if (!confirm(`¿Estás seguro de que quieres activar a ${capitalizeText(collaborator.first_name)} ${capitalizeText(collaborator.last_name)}?`)) {
      return
    }
    try {
      console.log('🔄 Activando colaborador:', collaborator.id)
      const response = await fetch('/api/collaborators', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: collaborator.id,
          is_active: true
        })
      })
      const result = await response.json()
      console.log('📡 Respuesta de la API:', response.status, response.ok)
      if (response.ok) {
        console.log('✅ Colaborador activado exitosamente')
        alert('✅ Colaborador activado exitosamente')
        if (session?.user?.companyId) {
          const response = await fetch('/api/collaborators')
          if (response.ok) {
            const data = await response.json()
            setCollaborators(data)
          }
        }
      } else {
        console.error('❌ Error al activar colaborador:', result)
        alert(`❌ Error al activar colaborador: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`❌ Error de red: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }
  const { data: session, status } = useSession()
  const router = useRouter()

  // Función helper para capitalizar texto
  const capitalizeText = (text: string) => {
    return text?.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') || ''
  }

  // Función helper para extraer código de país y número del teléfono
  const parsePhoneNumber = (phone: string) => {
    if (!phone) return { country: 'CL', number: '' }
    
    // Buscar el código de país más largo que coincida
    const countryCodes = [
      { code: '+56', country: 'CL' }, // Chile
      { code: '+54', country: 'AR' }, // Argentina
      { code: '+51', country: 'PE' }, // Perú
      { code: '+57', country: 'CO' }, // Colombia
      { code: '+52', country: 'MX' }, // México
      { code: '+1', country: 'US' },  // Estados Unidos
      { code: '+55', country: 'BR' }, // Brasil
      { code: '+34', country: 'ES' }, // España
      { code: '+49', country: 'DE' }, // Alemania
      { code: '+33', country: 'FR' }, // Francia
    ]
    
    // Ordenar por longitud de código (más largo primero)
    countryCodes.sort((a, b) => b.code.length - a.code.length)
    
    for (const country of countryCodes) {
      if (phone.startsWith(country.code)) {
        return {
          country: country.country,
          number: phone.substring(country.code.length)
        }
      }
    }
    
    // Si no encuentra código de país, asumir Chile
    return { country: 'CL', number: phone }
  }
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [openEditDialog, setOpenEditDialog] = useState(false)
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [searchTerm, setSearchTerm] = useState('')
  const [companyIndustry, setCompanyIndustry] = useState<IndustryType | string>(IndustryType.OTHER)
  const [positionValue, setPositionValue] = useState('')
  const [positionOptions, setPositionOptions] = useState<string[]>([])
  const [positionWarning, setPositionWarning] = useState('')
  const [customPositions, setCustomPositions] = useState<string[]>([])
  const [positionError, setPositionError] = useState('')
  const [industryLoaded, setIndustryLoaded] = useState(false)
  const [workerType, setWorkerType] = useState('')
  const [showWorkerType, setShowWorkerType] = useState(false)
  const [phoneValue, setPhoneValue] = useState<string>('')
  const [emergencyPhoneValue, setEmergencyPhoneValue] = useState<string>('')
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<string>('CL')
  const [selectedEmergencyCountry, setSelectedEmergencyCountry] = useState<string>('CL')
  const [companyCountry, setCompanyCountry] = useState<string>('CL') // Default Chile
  const [salaryValue, setSalaryValue] = useState<string>('')
  const [gender, setGender] = useState<string>('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  // Helper para intentar subir la foto en varios buckets sin usar listBuckets()
  const attemptUploadToBuckets = async (file: File, path: string) => {
    // Probar primero el bucket principal 'companies', luego buckets legacy
    const buckets = ['companies', 'collaborator', 'collaborator-photos']
    let lastError: any = null

    for (const b of buckets) {
      try {
        // Intentar subir directamente al bucket; esto funciona con la anon key si el bucket existe y es público/permitido
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(b)
          .upload(path, file)

        if (!uploadError) {
          // Obtener URL pública (no es async)
          const { data: publicData } = supabase.storage.from(b).getPublicUrl(path)
          const publicUrl = publicData?.publicUrl || null
          return { bucket: b, uploadData, publicUrl }
        }

        // Guardar último error y probar el siguiente bucket
        lastError = uploadError
        console.warn(`Intento de subida al bucket ${b} falló:`, uploadError)
      } catch (err) {
        lastError = err
        console.warn(`Excepción al intentar subir a ${b}:`, err)
      }
    }

    // Ningún bucket funcionó
    throw new Error(lastError?.message || 'No se pudo subir la foto a ningún bucket disponible')
  }

  // Opciones de tallas de ropa (solo letras)
  const clothingSizes = [
    'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'
  ]

  // Opciones de género
  const genderOptions = [
    { value: 'M', label: 'Masculino' },
    { value: 'F', label: 'Femenino' },
    { value: 'O', label: 'Otro' }
  ]

  // Función para formatear moneda según el país
  const formatCurrency = (value: number, country: string) => {
    const currencyMap: Record<string, { currency: string; locale: string }> = {
      'CL': { currency: 'CLP', locale: 'es-CL' }, // Chile
      'AR': { currency: 'ARS', locale: 'es-AR' }, // Argentina
      'PE': { currency: 'PEN', locale: 'es-PE' }, // Perú
      'CO': { currency: 'COP', locale: 'es-CO' }, // Colombia
      'MX': { currency: 'MXN', locale: 'es-MX' }, // México
      'US': { currency: 'USD', locale: 'en-US' }, // Estados Unidos
      'BR': { currency: 'BRL', locale: 'pt-BR' }, // Brasil
      'ES': { currency: 'EUR', locale: 'es-ES' }, // España
      'DE': { currency: 'EUR', locale: 'de-DE' }, // Alemania
      'FR': { currency: 'EUR', locale: 'fr-FR' }, // Francia
    }

    const config = currencyMap[country] || currencyMap['CL'] // Fallback a Chile
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Función para formatear número con separadores de miles
  const formatNumber = (value: number, country: string) => {
    const localeMap: Record<string, string> = {
      'CL': 'es-CL', // Chile
      'AR': 'es-AR', // Argentina
      'PE': 'es-PE', // Perú
      'CO': 'es-CO', // Colombia
      'MX': 'es-MX', // México
      'US': 'en-US', // Estados Unidos
      'BR': 'pt-BR', // Brasil
      'ES': 'es-ES', // España
      'DE': 'de-DE', // Alemania
      'FR': 'fr-FR', // Francia
    }

    const locale = localeMap[country] || localeMap['CL']
    return new Intl.NumberFormat(locale).format(value)
  }

  // Función para manejar el envío del formulario
  const handleSubmitCollaborator = async (formData: FormData) => {
    let photoUrl = null
    let collaboratorId = null

    // Obtener y limpiar documento (solo números/letras)
    const rawDocument = (formData.get('document') as string) || ''
    const cleanDocument = rawDocument.replace(/[^a-zA-Z0-9]/g, '')

    // Obtener primer apellido (puede ser el primer string antes de un espacio)
    const rawLastName = (formData.get('last_name') as string) || ''
    const firstSurname = rawLastName.split(' ')[0] || ''

    // Construir contraseña inicial: documento_limpio + '_' + primer apellido (sin espacios)
    const initialPassword = `${cleanDocument}_${firstSurname}`

    // Primero crear el colaborador sin foto
    const collaboratorData = {
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      document: cleanDocument,
      email: formData.get('email') as string,
      phone: phoneValue, // Teléfono completo con código de país
      address: formData.get('address') as string,
      position: formData.get('position') as string,
      worker_type: showWorkerType ? workerType : null, // Solo para minería
      salary: parseFloat(salaryValue.replace(/[^\d]/g, '')) || 0,
      birth_date: formData.get('birth_date') as string,
      hire_date: formData.get('hire_date') as string,
      emergency_contact: emergencyPhoneValue, // Teléfono de emergencia con código de país
      upper_clothing_size: formData.get('upper_clothing_size') as string,
      lower_clothing_size: formData.get('lower_clothing_size') as string,
      shoe_size: formData.get('shoe_size') as string,
      gender: gender, // Campo de género
      photo_url: null, // Inicialmente sin foto
      epp_details: {},
      is_active: true,
      company_id: session?.user?.companyId,
      password: initialPassword // Enviar contraseña inicial al backend
    }

    console.log('📱 Datos del colaborador:', collaboratorData)
    console.log('📞 Teléfono completo:', collaboratorData.phone)
    console.log('🌍 País detectado:', phoneValue?.substring(0, 3))
    
    try {
      console.log('🚀 Enviando datos a la API...')
      const response = await fetch('/api/collaborators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(collaboratorData)
      })
      
      console.log('📡 Respuesta de la API:', response.status, response.ok)
      
      if (response.ok) {
        const result = await response.json()
        console.log('✅ Colaborador creado exitosamente:', result)
        collaboratorId = result.id
        
        // Ahora subir la foto si existe
        if (photoFile && collaboratorId) {
            try {
              console.log('📸 Iniciando subida de foto...')
            console.log('📁 Archivo:', photoFile.name, 'Tamaño:', photoFile.size, 'bytes')
            
            // Validar tipo de archivo
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
            if (!allowedTypes.includes(photoFile.type)) {
              throw new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF, WebP)')
            }
            
            // Validar tamaño (máximo 5MB)
            const maxSize = 5 * 1024 * 1024 // 5MB
            if (photoFile.size > maxSize) {
              throw new Error('El archivo es demasiado grande. Máximo 5MB permitido')
            }
            
            const fileExt = photoFile.name.split('.').pop()
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
            const filePath = `${session?.user?.companyId}/collaborators/${collaboratorId}/${fileName}`
            
            console.log('📤 Subiendo a:', filePath)

            // Asegurar bucket en el servidor (crea 'collaborator' si no existe)
            try {
              await fetch('/api/storage/ensure-bucket', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucket: 'companies' })
              })
            } catch (err) {
              console.warn('No se pudo garantizar bucket en el servidor:', err)
            }

            // Intentar subir al primer bucket disponible (no usamos listBuckets porque la anon key no lista)
            const uploadResult = await attemptUploadToBuckets(photoFile, filePath)
            console.log('✅ Foto subida exitosamente al bucket:', uploadResult.bucket)
            photoUrl = uploadResult.publicUrl
            console.log('🔗 URL pública generada:', photoUrl)
            
            // Actualizar el colaborador con la URL de la foto
            console.log('🔄 Actualizando colaborador con URL de foto...')
            const updateResponse = await fetch('/api/collaborators', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                id: collaboratorId,
                photo_url: photoUrl
              })
            })
            
            if (updateResponse.ok) {
              console.log('✅ Colaborador actualizado con foto exitosamente')
            } else {
              console.warn('⚠️ Colaborador creado pero no se pudo actualizar con la foto')
            }
            
          } catch (error) {
            console.error('❌ Error procesando foto:', error)
            alert(`Error al procesar la foto: ${error instanceof Error ? error.message : 'Error desconocido'}. El colaborador fue creado sin foto.`)
          }
        }
        
        alert('Colaborador creado exitosamente')
        // Cerrar modal y limpiar formulario
        setOpenDialog(false)
        // Recargar la lista de colaboradores
        window.location.reload()
      } else {
        const error = await response.json()
        console.error('❌ Error al crear colaborador:', error)
        
        // Mostrar mensaje específico según el tipo de error
        let errorMessage = 'Error desconocido'
        
        if (error.code === 'COLLABORATOR_EXISTS') {
          errorMessage = `❌ Colaborador ya existe\n\n${error.details}\n\nPor favor usa un email diferente.`
        } else if (error.code === 'USER_EXISTS') {
          errorMessage = `❌ Usuario ya existe\n\n${error.details}\n\nPor favor usa un email diferente.`
        } else if (error.code === 'MISSING_SERVICE_KEY') {
          errorMessage = `❌ Configuración faltante\n\n${error.details}\n\nContacta al administrador del sistema.`
        } else if (error.details) {
          errorMessage = `❌ Error: ${error.error}\n\n${error.details}`
        } else {
          errorMessage = `❌ Error al crear colaborador: ${error.error || error.message || 'Error desconocido'}`
        }
        
        alert(errorMessage)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`Error de conexión: ${error}`)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  // Cargar industria de la empresa y opciones de cargos
  useEffect(() => {
    const loadCompanyIndustry = async () => {
      if (session?.user?.companyId) {
        try {
          console.log('🔍 Cargando industria de la empresa:', session.user.companyId)
          
          // Llamada a la API para obtener la industria de la empresa
          const response = await fetch(`/api/companies/${session.user.companyId}`)
          console.log('📡 Respuesta de la API:', response.status, response.ok)
          
          if (response.ok) {
            const companyData = await response.json()
            const industry = companyData.industry || IndustryType.OTHER
            const country = companyData.country || 'CL' // Default Chile
            setCompanyIndustry(industry)
            setCompanyCountry(country)
            const standardPositions = getSuggestedPositions(industry)
            
            // Mostrar campo de tipo de trabajador solo para minería
            setShowWorkerType(industry === 'Minería')
            
            setPositionOptions([...standardPositions, ...customPositions])
            setIndustryLoaded(true)
          } else {
            console.warn('⚠️ No se pudo obtener la industria, usando fallback')
            // Fallback si no se puede obtener la industria
            setCompanyIndustry(IndustryType.OTHER)
            const standardPositions = getSuggestedPositions(IndustryType.OTHER)
            setPositionOptions([...standardPositions, ...customPositions])
            setIndustryLoaded(true)
          }
        } catch (error) {
          console.error('❌ Error loading company industry:', error)
          setCompanyIndustry(IndustryType.OTHER)
          const standardPositions = getSuggestedPositions(IndustryType.OTHER)
          setPositionOptions([...standardPositions, ...customPositions])
          setIndustryLoaded(true)
        }
      }
    }
    
    loadCompanyIndustry()
  }, [session?.user?.companyId])

  // Actualizar opciones cuando cambien los cargos personalizados
  useEffect(() => {
    if (industryLoaded) {
      const standardPositions = getSuggestedPositions(companyIndustry)
      const allOptions = [...standardPositions, ...customPositions]
      setPositionOptions(allOptions)
    }
  }, [customPositions, companyIndustry, industryLoaded])

  useEffect(() => {
    const fetchCollaborators = async () => {
      if (!session?.user?.companyId) return
      
      try {
        const response = await fetch('/api/collaborators')
        if (response.ok) {
          const data = await response.json()
          setCollaborators(data)
        }
      } catch (error) {
        console.error('Error fetching collaborators:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session?.user?.companyId) {
      fetchCollaborators()
    }
  }, [session])

  const handleAddCollaborator = () => {
    setOpenDialog(true)
  }

  const handleEditCollaborator = (collaborator: Collaborator) => {
    setEditingCollaborator(collaborator)
    
    // Parsear teléfonos para extraer código de país y número
    const phoneData = parsePhoneNumber(collaborator.phone || '')
    const emergencyPhoneData = parsePhoneNumber(collaborator.emergency_contact || '')
    
    // Establecer los valores de teléfono (solo el número, sin código de país)
    setPhoneValue(phoneData.number)
    setEmergencyPhoneValue(emergencyPhoneData.number)
    setSelectedPhoneCountry(phoneData.country)
    setSelectedEmergencyCountry(emergencyPhoneData.country)
    
    // Establecer otros valores
    setPositionValue(collaborator.position || '')
    setWorkerType(collaborator.worker_type || '')
    setSalaryValue(collaborator.salary ? collaborator.salary.toString() : '')
    setOpenEditDialog(true)
  }

  const handleUpdateCollaborator = async (formData: FormData) => {
    try {
      console.log('🔄 Iniciando actualización de colaborador...')
      
      let photoUrl = editingCollaborator?.photo_url || null
      
      // Si hay una nueva foto, subirla
      if (photoFile && editingCollaborator?.id) {
        try {
          console.log('📸 Iniciando subida de nueva foto...')
          console.log('📁 Archivo:', photoFile.name, 'Tamaño:', photoFile.size, 'bytes')
            
          // Validar tipo de archivo
          const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
          if (!allowedTypes.includes(photoFile.type)) {
            throw new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF, WebP)')
          }
            
          // Validar tamaño (máximo 5MB)
          const maxSize = 5 * 1024 * 1024 // 5MB
          if (photoFile.size > maxSize) {
            throw new Error('El archivo es demasiado grande. Máximo 5MB permitido')
          }
            
          const fileExt = photoFile.name.split('.').pop()
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
          const filePath = `${session?.user?.companyId}/collaborators/${editingCollaborator.id}/${fileName}`
            
          console.log('📤 Subiendo a:', filePath)

          // Asegurar bucket en el servidor (crea 'collaborator' si no existe)
          try {
            await fetch('/api/storage/ensure-bucket', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bucket: 'companies' })
            })
          } catch (err) {
            console.warn('No se pudo garantizar bucket en el servidor:', err)
          }

          // Intentar subir al primer bucket disponible (no usamos listBuckets porque la anon key no lista)
          const uploadResult = await attemptUploadToBuckets(photoFile, filePath)
          console.log('✅ Foto subida exitosamente al bucket:', uploadResult.bucket)
          photoUrl = uploadResult.publicUrl
          console.log('🔗 URL pública generada:', photoUrl)
          
        } catch (error) {
          console.error('❌ Error procesando foto:', error)
          alert(`Error al procesar la foto: ${error instanceof Error ? error.message : 'Error desconocido'}. Continuando sin actualizar la foto...`)
        }
      }
      
      const collaboratorData = {
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        document: formData.get('document') as string,
        email: formData.get('email') as string,
        phone: phoneValue,
        address: formData.get('address') as string,
        position: positionValue,
        worker_type: workerType,
        salary: salaryValue ? parseFloat(salaryValue.replace(/[^0-9]/g, '')) : null,
        birth_date: formData.get('birth_date') as string,
        hire_date: formData.get('hire_date') as string,
        emergency_contact: emergencyPhoneValue,
        upper_clothing_size: formData.get('upper_clothing_size') as string,
        lower_clothing_size: formData.get('lower_clothing_size') as string,
        shoe_size: formData.get('shoe_size') as string,
        gender: formData.get('gender') as string,
        photo_url: photoUrl,
        epp_details: {},
        is_active: true,
        company_id: session?.user?.companyId
      }

      console.log('📱 Datos del colaborador:', collaboratorData)

      const response = await fetch('/api/collaborators', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editingCollaborator?.id,
          ...collaboratorData
        })
      })

      const result = await response.json()
      console.log('📡 Respuesta de la API:', response.status, response.ok)

      if (response.ok) {
        console.log('✅ Colaborador actualizado exitosamente:', result)
        alert('✅ Colaborador actualizado exitosamente')
        setOpenEditDialog(false)
        setEditingCollaborator(null)
        // Recargar la lista de colaboradores
        if (session?.user?.companyId) {
          const response = await fetch('/api/collaborators')
          if (response.ok) {
            const data = await response.json()
            setCollaborators(data)
          }
        }
      } else {
        console.error('❌ Error al actualizar colaborador:', result)
        alert(`❌ Error al actualizar colaborador: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`❌ Error de red: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const handleDeactivateCollaborator = async (collaborator: Collaborator) => {
    if (!confirm(`¿Estás seguro de que quieres desactivar a ${capitalizeText(collaborator.first_name)} ${capitalizeText(collaborator.last_name)}?`)) {
      return
    }

    try {
      console.log('🔄 Desactivando colaborador:', collaborator.id)
      
      const response = await fetch('/api/collaborators', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: collaborator.id,
          is_active: false
        })
      })

      const result = await response.json()
      console.log('📡 Respuesta de la API:', response.status, response.ok)

      if (response.ok) {
        console.log('✅ Colaborador desactivado exitosamente')
        alert('✅ Colaborador desactivado exitosamente')
        // Recargar la lista de colaboradores
        if (session?.user?.companyId) {
          const response = await fetch('/api/collaborators')
          if (response.ok) {
            const data = await response.json()
            setCollaborators(data)
          }
        }
      } else {
        console.error('❌ Error al desactivar colaborador:', result)
        alert(`❌ Error al desactivar colaborador: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('❌ Error de red:', error)
      alert(`❌ Error de red: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const handleUploadFile = () => {
    // Implementar subida de archivos
    console.log('Upload file functionality')
  }

  const handleExportData = () => {
    // Implementar exportación de datos
    console.log('Export data functionality')
  }

  const filteredCollaborators = collaborators.filter(collab =>
    `${collab.first_name} ${collab.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    collab.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (status === 'loading' || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  if (!session) {
    return null
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Box sx={{ flex: 1 }}>
        <UserHeader title="Colaboradores" />
        <Container maxWidth="xl">
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ color: colors.blue1, fontWeight: 700, mt: 2 }}>
              Gestión de Colaboradores
            </Typography>
            <Typography variant="body1" sx={{ color: colors.blue7 }}>
              Administra la información de todos los colaboradores de la empresa
            </Typography>
          </Box>

          {/* Estadísticas rápidas */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, mb: 4 }}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Person sx={{ color: colors.blue6, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="primary">
                      {collaborators.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Colaboradores
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Person sx={{ color: colors.gold3, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="success.main">
                      {collaborators.filter(c => c.is_active).length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Activos
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Person sx={{ color: colors.gray6, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="text.secondary">
                      {collaborators.filter(c => !c.is_active).length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Inactivos
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <Business sx={{ color: colors.blue6, mr: 2 }} />
                  <Box>
                    <Typography variant="h4" color="info.main">
                      {new Set(collaborators.map(c => c.position)).size}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Roles Diferentes
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Barra de herramientas */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
              <Box display="flex" alignItems="center" gap={2}>
                <TextField
                  size="small"
                  placeholder="Buscar colaboradores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1, color: colors.gray6 }} />
                  }}
                  sx={{ minWidth: 250 }}
                />
                <IconButton>
                  <FilterList />
                </IconButton>
              </Box>
              <Box display="flex" gap={1}>
                <Button
                  variant={viewMode === 'cards' ? 'contained' : 'outlined'}
                  startIcon={<ViewModule />}
                  onClick={() => setViewMode('cards')}
                  sx={{ textTransform: 'none' }}
                >
                  Tarjetas
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'contained' : 'outlined'}
                  startIcon={<ViewList />}
                  onClick={() => setViewMode('table')}
                  sx={{ textTransform: 'none' }}
                >
                  Tabla
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Upload />}
                  onClick={handleUploadFile}
                  sx={{ textTransform: 'none' }}
                >
                  Importar
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Download />}
                  onClick={handleExportData}
                  sx={{ textTransform: 'none' }}
                >
                  Exportar
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={handleAddCollaborator}
                  sx={{ 
                    textTransform: 'none',
                    background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                    '&:hover': {
                      background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
                    }
                  }}
                >
                  Nuevo Colaborador
                </Button>
              </Box>
            </Box>
          </Paper>

          {/* Vista de colaboradores */}
          {viewMode === 'cards' ? (
            <Box 
              display="grid" 
              gridTemplateColumns={{
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)'
              }}
              gap={2}
            >
            {filteredCollaborators.map((collaborator) => (
              <Paper 
                key={collaborator.id} 
                elevation={2}
                sx={{ 
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${colors.gray1}`,
                  '&:hover': {
                    borderColor: colors.blue6,
                    boxShadow: `0 4px 12px ${colors.blue15}`
                  }
                }}
              >
                {/* Header con avatar y nombre */}
                <Box display="flex" alignItems="center" mb={2}>
                  <Avatar 
                    src={collaborator.photo_url} 
                    sx={{ width: { xs: 48, sm: 56, md: 64 }, height: { xs: 48, sm: 56, md: 64 }, mr: 2, bgcolor: colors.blue6, fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' } }}
                    imgProps={{ style: { objectFit: 'cover' } }}
                  >
                    {collaborator.first_name?.charAt(0)}{collaborator.last_name?.charAt(0)}
                  </Avatar>
                  <Box flex={1}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: colors.blue1, mb: 0.5 }}>
                      {capitalizeText(collaborator.first_name)} {capitalizeText(collaborator.last_name)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.gray6 }}>
                      {collaborator.document || 'Sin documento'}
                    </Typography>
                  </Box>
                  <Chip 
                    label={collaborator.is_active ? 'Activo' : 'Inactivo'}
                    size="small"
                    sx={{
                      backgroundColor: collaborator.is_active ? colors.blue15 : colors.gray8,
                      color: collaborator.is_active ? colors.blue6 : colors.gray4,
                      fontSize: '0.7rem',
                      height: 20
                    }}
                  />
                </Box>

                {/* Información de contacto */}
                <Box mb={2}>
                  <Typography variant="body2" sx={{ color: colors.gray6, mb: 0.5 }}>
                    📧 {collaborator.email}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.gray6, mb: 0.5 }}>
                    📞 {collaborator.phone || 'Sin teléfono'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.gray6 }}>
                    💼 {collaborator.position || 'Sin cargo'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.gray6 }}>
                    🏠 {capitalizeText(collaborator.address || 'Sin dirección')}
                  </Typography>
                </Box>

                {/* Información laboral */}
                <Box mb={2}>
                  {collaborator.salary && (
                    <Typography variant="body2" sx={{ color: colors.gray6, mb: 0.5 }}>
                      💰 {formatCurrency(collaborator.salary, companyCountry)}
                    </Typography>
                  )}
                  {showWorkerType && collaborator.worker_type && (
                    <Box mb={0.5}>
                      <Chip 
                        label={collaborator.worker_type}
                        size="small"
                        sx={{
                          backgroundColor: 
                            collaborator.worker_type === 'Directo' ? colors.blue15 :
                            collaborator.worker_type === 'Indirecto' ? colors.blue13 :
                            collaborator.worker_type === 'Contratista' ? colors.gold7 :
                            collaborator.worker_type === 'Subcontratista' ? colors.gray9 :
                            colors.gray8,
                          color: 
                            collaborator.worker_type === 'Directo' ? colors.blue6 :
                            collaborator.worker_type === 'Indirecto' ? colors.blue4 :
                            collaborator.worker_type === 'Contratista' ? colors.gold3 :
                            collaborator.worker_type === 'Subcontratista' ? colors.gray4 :
                            colors.gray6,
                          fontSize: '0.7rem',
                          height: 20
                        }}
                      />
                    </Box>
                  )}
                  <Typography variant="body2" sx={{ color: colors.gray6 }}>
                    📅 Ingreso: {collaborator.hire_date ? new Date(collaborator.hire_date).toLocaleDateString('es-CL') : 'Sin fecha'}
                  </Typography>
                </Box>

                {/* Información física */}
                <Box mb={2}>
                  <Typography variant="body2" sx={{ color: colors.gray6, mb: 0.5 }}>
                    👕 Superior: {collaborator.upper_clothing_size || 'Sin especificar'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.gray6, mb: 0.5 }}>
                    👖 Inferior: {collaborator.lower_clothing_size || 'Sin especificar'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.gray6 }}>
                    👟 Zapatos: {collaborator.shoe_size || 'Sin especificar'}
                  </Typography>
                </Box>

                {/* Botones de acción */}
                <Box display="flex" gap={1} justifyContent="flex-end">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Edit />}
                    sx={{
                      textTransform: 'none',
                      borderColor: colors.blue6,
                      color: colors.blue6,
                      '&:hover': {
                        borderColor: colors.blue4,
                        backgroundColor: colors.blue15
                      }
                    }}
                    onClick={() => handleEditCollaborator(collaborator)}
                  >
                    Editar
                  </Button>
                  {collaborator.is_active ? (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Delete />}
                      sx={{
                        textTransform: 'none',
                        borderColor: colors.gray4,
                        color: colors.gray4,
                        '&:hover': {
                          borderColor: colors.gray2,
                          backgroundColor: colors.gray9
                        }
                      }}
                      onClick={() => handleDeactivateCollaborator(collaborator)}
                    >
                      Desactivar
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Add />}
                      sx={{
                        textTransform: 'none',
                        borderColor: colors.blue4,
                        color: colors.blue4,
                        '&:hover': {
                          borderColor: colors.blue6,
                          backgroundColor: colors.blue15
                        }
                      }}
                      onClick={() => handleActivateCollaborator(collaborator)}
                    >
                      Activar
                    </Button>
                  )}
                </Box>
              </Paper>
            ))}
            </Box>
          ) : (
            /* Tabla compacta tipo Excel */
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: colors.blue15 }}>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120 }}>Nombre</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 100 }}>Documento</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 150 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120 }}>Teléfono</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 120 }}>Cargo</TableCell>
                    {showWorkerType && (
                      <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 100 }}>Tipo</TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 100 }}>Salario</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 80 }}>Estado</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: colors.blue1, minWidth: 100 }}>Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredCollaborators.map((collaborator) => (
                    <TableRow key={collaborator.id} hover>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <Avatar
                            src={collaborator.photo_url}
                            sx={{ width: { xs: 28, sm: 32, md: 40 }, height: { xs: 28, sm: 32, md: 40 }, mr: 1, bgcolor: colors.blue6, fontSize: { xs: '0.65rem', sm: '0.75rem', md: '0.9rem' } }}
                            imgProps={{ style: { objectFit: 'cover' } }}
                          >
                            {collaborator.first_name?.charAt(0)}{collaborator.last_name?.charAt(0)}
                          </Avatar>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {collaborator.document || 'Sin documento'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {collaborator.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {collaborator.phone || 'Sin teléfono'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {collaborator.position || 'Sin cargo'}
                        </Typography>
                      </TableCell>
                      {showWorkerType && (
                        <TableCell>
                          {collaborator.worker_type ? (
                            <Chip 
                              label={collaborator.worker_type}
                              size="small"
                              sx={{
                                backgroundColor: 
                                  collaborator.worker_type === 'Directo' ? colors.blue15 :
                                  collaborator.worker_type === 'Indirecto' ? colors.blue13 :
                                  collaborator.worker_type === 'Contratista' ? colors.gold7 :
                                  collaborator.worker_type === 'Subcontratista' ? colors.gray9 :
                                  colors.gray8,
                                color: 
                                  collaborator.worker_type === 'Directo' ? colors.blue6 :
                                  collaborator.worker_type === 'Indirecto' ? colors.blue4 :
                                  collaborator.worker_type === 'Contratista' ? colors.gold3 :
                                  collaborator.worker_type === 'Subcontratista' ? colors.gray4 :
                                  colors.gray6,
                                fontSize: '0.65rem',
                                height: 18
                              }}
                            />
                          ) : (
                            <Typography variant="body2" sx={{ fontSize: '0.8rem', color: colors.gray6 }}>
                              Sin especificar
                            </Typography>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {collaborator.salary ? formatCurrency(collaborator.salary, companyCountry) : 'Sin especificar'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={collaborator.is_active ? 'Activo' : 'Inactivo'}
                          size="small"
                          sx={{
                            backgroundColor: collaborator.is_active ? colors.blue15 : colors.gray8,
                            color: collaborator.is_active ? colors.blue6 : colors.gray4,
                            fontSize: '0.65rem',
                            height: 18
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={0.5}>
                          <IconButton 
                            size="small" 
                            sx={{ 
                              color: colors.blue6,
                              '&:hover': { backgroundColor: colors.blue15 }
                            }}
                            onClick={() => handleEditCollaborator(collaborator)}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                          {collaborator.is_active ? (
                            <IconButton 
                              size="small" 
                              sx={{ 
                                color: colors.gray4,
                                '&:hover': { backgroundColor: colors.gray9 }
                              }}
                              onClick={() => handleDeactivateCollaborator(collaborator)}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          ) : (
                            <IconButton 
                              size="small" 
                              sx={{ 
                                color: colors.blue4,
                                '&:hover': { backgroundColor: colors.blue15 }
                              }}
                              onClick={() => handleActivateCollaborator(collaborator)}
                            >
                              <Add fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* FAB para agregar colaborador */}
          <Fab
            color="primary"
            aria-label="add"
            onClick={handleAddCollaborator}
            sx={{
              position: 'fixed',
              bottom: 16,
              right: 16,
              background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
              '&:hover': {
                background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
              }
            }}
          >
            <Add />
          </Fab>

          {/* Dialog para agregar/editar colaborador */}
          <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
            <DialogTitle sx={{ 
              background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
              color: colors.white,
              fontWeight: 600,
              fontSize: '1.2rem'
            }}>
              Nuevo Colaborador
            </DialogTitle>
            <DialogContent sx={{ p: 3 }}>
              <Box 
                id="collaborator-form"
                component="form"
                display="grid"
                gridTemplateColumns={{
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)'
                }}
                gap={2}
                sx={{ mt: 1 }}
              >
                {/* Información Personal */}
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1', lg: '1 / -1' } }}>
                  <Typography variant="h6" sx={{ color: colors.blue1, mb: 1.5, fontWeight: 600, fontSize: '1.1rem' }}>
                    Información Personal
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Nombres *
                  </Typography>
                  <TextField 
                    name="first_name"
                    fullWidth 
                    variant="outlined" 
                    required 
                    size="small"
                    onChange={(e) => {
                      e.target.value = e.target.value
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Apellidos *
                  </Typography>
                  <TextField 
                    name="last_name"
                    fullWidth 
                    variant="outlined" 
                    required 
                    size="small"
                    onChange={(e) => {
                      e.target.value = e.target.value
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                    }}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    RUT / DNI / CI
                  </Typography>
                  <TextField 
                    name="document"
                    fullWidth 
                    variant="outlined" 
                    placeholder="12345678-9" 
                    size="small"
                    onChange={(e) => {
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9kK]/g, '');
                      
                      // Solo formatear si es un RUT chileno válido y completo
                      if (cleanValue.length >= 8 && cleanValue.length <= 10) {
                        const rut = cleanValue.slice(0, -1);
                        const dv = cleanValue.slice(-1);
                        
                        // Verificar que el dígito verificador sea correcto
                        if (rut.length >= 7 && rut.length <= 9 && /^[0-9kK]$/.test(dv)) {
                          // Calcular dígito verificador correcto
                          let suma = 0;
                          let multiplicador = 2;
                          
                          for (let i = rut.length - 1; i >= 0; i--) {
                            suma += parseInt(rut[i]) * multiplicador;
                            multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
                          }
                          
                          const resto = suma % 11;
                          const dvCalculado = resto === 0 ? '0' : resto === 1 ? 'K' : (11 - resto).toString();
                          
                          // Solo formatear si el dígito verificador es correcto Y el RUT está completo
                          if (dv.toUpperCase() === dvCalculado && cleanValue.length === (rut.length + 1)) {
                            const formattedRut = rut.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv.toUpperCase();
                            e.target.value = formattedRut;
                          }
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9kK]/g, '');
                      
                      // Verificar si el RUT es válido al salir del input
                      if (cleanValue.length >= 8 && cleanValue.length <= 10) {
                        const rut = cleanValue.slice(0, -1);
                        const dv = cleanValue.slice(-1);
                        
                        if (rut.length >= 7 && rut.length <= 9 && /^[0-9kK]$/.test(dv)) {
                          // Calcular dígito verificador correcto
                          let suma = 0;
                          let multiplicador = 2;
                          
                          for (let i = rut.length - 1; i >= 0; i--) {
                            suma += parseInt(rut[i]) * multiplicador;
                            multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
                          }
                          
                          const resto = suma % 11;
                          const dvCalculado = resto === 0 ? '0' : resto === 1 ? 'K' : (11 - resto).toString();
                          
                          // Si el RUT no es válido, revertir a formato sin puntos
                          if (dv.toUpperCase() !== dvCalculado) {
                            e.target.value = cleanValue;
                          }
                        }
                      }
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Email *
                  </Typography>
                  <TextField 
                    name="email" 
                    fullWidth 
                    type="email" 
                    variant="outlined" 
                    required 
                    size="small"
                    onChange={(e) => {
                      e.target.value = e.target.value.toLowerCase()
                    }}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Teléfono
                  </Typography>
                  <CountryPhoneInput
                    value={phoneValue}
                    onChange={(value) => setPhoneValue(value || '')}
                    placeholder="Ingresa el número de teléfono"
                    defaultCountry="CL"
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Fecha de Nacimiento
                  </Typography>
                  <TextField name="birth_date" fullWidth type="date" variant="outlined" InputLabelProps={{ shrink: true }} size="small" />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Sexo
                  </Typography>
                  <TextField
                    name="gender"
                    fullWidth
                    select
                    variant="outlined"
                    size="small"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: colors.gray4 },
                        '&:hover fieldset': { borderColor: colors.blue6 },
                        '&.Mui-focused fieldset': { borderColor: colors.blue6 },
                      },
                    }}
                  >
                    {genderOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Foto del Colaborador
                  </Typography>
                  <input
                    type="file"
                    id="photo-upload"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setPhotoFile(file)
                      }
                    }}
                  />
                  <label htmlFor="photo-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      fullWidth
                      size="medium"
                      startIcon={<Add />}
                      sx={{
                        borderColor: colors.gray4,
                        color: colors.blue1,
                        borderRadius: 1,
                        minHeight: 36,
                        py: 1,
                        '&:hover': {
                          borderColor: colors.blue6,
                          backgroundColor: colors.blue1 + '10'
                        }
                      }}
                    >
                      {photoFile ? 'Cambiar Foto' : 'Seleccionar Foto'}
                    </Button>
                  </label>
                  {photoFile && (
                    <Typography variant="caption" sx={{ color: colors.blue6, mt: 1, display: 'block' }}>
                    ✓ {photoFile.name}
                    </Typography>
                  )}
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Dirección
                  </Typography>
                  <TextField 
                    name="address"
                    fullWidth 
                    variant="outlined" 
                    size="small"
                    onChange={(e) => {
                      e.target.value = e.target.value
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                    }}
                  />
                </Box>

                {/* Información Laboral */}
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1', lg: '1 / -1' }, mt: 1.5 }}>
                  <Typography variant="h6" sx={{ color: colors.blue1, mb: 1.5, fontWeight: 600, fontSize: '1.1rem' }}>
                    Información Laboral
                  </Typography>
                </Box>
                
                <Box>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: colors.blue1 }}>
                      Cargo/Posición *
                    </Typography>
                    <Chip 
                      label={companyIndustry.toLowerCase()} 
                      size="small" 
                      sx={{ 
                        fontSize: '0.7rem',
                        height: 20,
                        backgroundColor: colors.blue15,
                        color: colors.blue6
                      }} 
                    />
                  </Box>
                  <Autocomplete
                    freeSolo
                    options={positionOptions}
                    value={positionValue}
                    loading={!industryLoaded}
                    loadingText="Cargando cargos según industria..."
                    openOnFocus
                    autoHighlight
                    selectOnFocus
                    clearOnBlur
                    handleHomeEndKeys
                    ListboxProps={{
                      style: {
                        maxHeight: '300px'
                      }
                    }}
                    slotProps={{
                      popper: {
                        placement: 'bottom-start',
                        modifiers: [
                          {
                            name: 'preventOverflow',
                            enabled: true,
                            options: {
                              boundary: 'viewport'
                            }
                          }
                        ]
                      }
                    }}
                    onChange={(event, newValue) => {
                      setPositionValue(newValue || '')
                      setPositionWarning('')
                      setPositionError('')
                      
                      if (newValue) {
                        // Validar cargo personalizado
                        const validation = validateCustomPosition(newValue)
                        if (!validation.isValid) {
                          setPositionError(validation.message || 'Cargo inválido')
                          return
                        }
                        
                        // Si no es estándar, mostrar sugerencias
                        if (!isStandardPosition(newValue, companyIndustry)) {
                          const similarPositions = findSimilarPositions(newValue, companyIndustry)
                          if (similarPositions.length > 0) {
                            setPositionWarning(`¿Te refieres a: ${similarPositions.slice(0, 3).join(', ')}?`)
                          } else {
                            // Es un cargo completamente nuevo, agregarlo a la lista
                            if (!customPositions.includes(newValue)) {
                              setCustomPositions(prev => [...prev, newValue])
                              addCustomPosition(newValue, companyIndustry)
                            }
                          }
                        }
                      }
                    }}
                    onInputChange={(event, newInputValue) => {
                      setPositionValue(newInputValue)
                      setPositionWarning('')
                      setPositionError('')
                      
                      if (newInputValue) {
                        // Validar cargo personalizado
                        const validation = validateCustomPosition(newInputValue)
                        if (!validation.isValid) {
                          setPositionError(validation.message || 'Cargo inválido')
                          return
                        }
                        
                        // Si no es estándar, mostrar sugerencias
                        if (!isStandardPosition(newInputValue, companyIndustry)) {
                          const similarPositions = findSimilarPositions(newInputValue, companyIndustry)
                          if (similarPositions.length > 0) {
                            setPositionWarning(`¿Te refieres a: ${similarPositions.slice(0, 3).join(', ')}?`)
                          }
                        }
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        name="position"
                        fullWidth
                        variant="outlined"
                        required
                        size="small"
                        placeholder="Selecciona o escribe un cargo"
                      />
                    )}
                    renderOption={(props, option) => {
                      const { key, ...otherProps } = props
                      const isCustom = customPositions.includes(option)
                      return (
                        <Box component="li" key={key} {...otherProps}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {option}
                            </Typography>
                            <Typography variant="caption" sx={{ color: colors.blue7 }}>
                              {isCustom ? 'Cargo personalizado' : `Cargo estándar para ${companyIndustry.toLowerCase()}`}
                            </Typography>
                          </Box>
                        </Box>
                      )
                    }}
                  />
                  {positionError && (
                    <Alert 
                      severity="error" 
                      sx={{ 
                        mt: 1, 
                        fontSize: '0.8rem',
                        '& .MuiAlert-message': {
                          fontSize: '0.8rem'
                        }
                      }}
                    >
                      {positionError}
                    </Alert>
                  )}
                  {positionError && (
                    <Alert 
                      severity="error" 
                      sx={{ 
                        mt: 1, 
                        fontSize: '0.8rem',
                        '& .MuiAlert-message': {
                          fontSize: '0.8rem'
                        }
                      }}
                    >
                      {positionError}
                    </Alert>
                  )}
                  {positionWarning && (
                    <Alert 
                      severity="warning" 
                      icon={<Warning />}
                      sx={{ 
                        mt: 1, 
                        fontSize: '0.8rem',
                        '& .MuiAlert-message': {
                          fontSize: '0.8rem'
                        }
                      }}
                    >
                      {positionWarning}
                    </Alert>
                  )}
                </Box>
                
                {/* Campo de Tipo de Trabajador - Solo para Minería */}
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Tipo de Trabajador
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    variant="outlined"
                    size="small"
                    value={workerType}
                    onChange={(e) => setWorkerType(e.target.value)}
                    SelectProps={{
                      native: true,
                    }}
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="General">General</option>
                    <option value="No aplica">No aplica</option>
                    <option value="Directo">Directo</option>
                    <option value="Indirecto">Indirecto</option>
                    <option value="Contratista">Contratista</option>
                    <option value="Subcontratista">Subcontratista</option>
                    <option value="Consultor">Consultor</option>
                  </TextField>
                </Box>
                {/* Comentario de EPP */}
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Comentario de EPP (opcional)
                  </Typography>
                  <TextField
                    name="epp_details"
                    fullWidth
                    variant="outlined"
                    size="small"
                    placeholder="Ejemplo: Entregado casco y botas el 10/10/2025"
                    onChange={(e) => {
                      // Guardar como string, el backend puede convertirlo a JSON si lo requiere
                    }}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Salario
                  </Typography>
                  <TextField 
                    name="salary" 
                    fullWidth 
                    type="text" 
                    variant="outlined" 
                    placeholder="500.000" 
                    size="small"
                    value={salaryValue}
                    onChange={(e) => {
                      // Permitir solo números y remover formato para el valor
                      const numericValue = e.target.value.replace(/[^\d]/g, '')
                      setSalaryValue(numericValue)
                    }}
                    onBlur={(e) => {
                      // Formatear con separadores cuando se sale del campo
                      const numericValue = parseFloat(salaryValue)
                      if (!isNaN(numericValue) && numericValue > 0) {
                        const formatted = formatNumber(numericValue, companyCountry)
                        setSalaryValue(formatted)
                      }
                    }}
                    InputProps={{
                      startAdornment: (
                        <Typography variant="body2" sx={{ color: colors.blue1, mr: 1, fontWeight: 500 }}>
                          {formatCurrency(0, companyCountry).replace('0', '')}
                        </Typography>
                      )
                    }}
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Fecha de Ingreso *
                  </Typography>
                  <TextField name="hire_date" fullWidth type="date" variant="outlined" InputLabelProps={{ shrink: true }} required size="small" />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Contacto de Emergencia
                  </Typography>
                  <CountryPhoneInput
                    value={emergencyPhoneValue}
                    onChange={setEmergencyPhoneValue}
                    placeholder="Teléfono de emergencia"
                  />
                </Box>

                {/* Información de EPP */}
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1', lg: '1 / -1' }, mt: 1.5 }}>
                  <Typography variant="h6" sx={{ color: colors.blue1, mb: 1.5, fontWeight: 600, fontSize: '1.1rem' }}>
                    Información de EPP
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Ropa Superior
                  </Typography>
                  <TextField
                    name="upper_clothing_size"
                    fullWidth
                    select
                    variant="outlined"
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: colors.gray4 },
                        '&:hover fieldset': { borderColor: colors.blue6 },
                        '&.Mui-focused fieldset': { borderColor: colors.blue6 },
                      },
                    }}
                  >
                    {clothingSizes.map((size) => (
                      <MenuItem key={size} value={size}>
                        {size}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Ropa Inferior
                  </Typography>
                  <TextField
                    name="lower_clothing_size"
                    fullWidth
                    select
                    variant="outlined"
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': { borderColor: colors.gray4 },
                        '&:hover fieldset': { borderColor: colors.blue6 },
                        '&.Mui-focused fieldset': { borderColor: colors.blue6 },
                      },
                    }}
                  >
                    {clothingSizes.map((size) => (
                      <MenuItem key={size} value={size}>
                        {size}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                    Talla de Zapatos
                  </Typography>
                  <TextField name="shoe_size" fullWidth variant="outlined" placeholder="40, 41, 42" size="small" />
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
              <Button 
                onClick={() => setOpenDialog(false)}
                variant="outlined"
                sx={{ textTransform: 'none', minWidth: 120 }}
              >
                Cancelar
              </Button>
              <Button 
                variant="contained"
                onClick={async () => {
                  console.log('🔄 Iniciando guardado de colaborador...')
                  
                  // Obtener datos del formulario
                  const form = document.getElementById('collaborator-form') as HTMLFormElement
                  if (!form) {
                    console.error('❌ No se encontró el formulario')
                    alert('Error: No se encontró el formulario')
                    return
                  }
                  
                  const formData = new FormData(form)
                  console.log('📋 Datos del formulario:', Object.fromEntries(formData.entries()))
                  
                  // Validar campos requeridos
                  const requiredFields = [
                    { field: 'first_name', label: 'Nombres' },
                    { field: 'last_name', label: 'Apellidos' },
                    { field: 'document', label: 'RUT/DNI/CI' },
                    { field: 'email', label: 'Email' }
                  ]
                  const missingFields = requiredFields.filter(({ field }) => !formData.get(field))
                  
                  if (missingFields.length > 0) {
                    const missingLabels = missingFields.map(({ label }) => label).join(', ')
                    console.error('❌ Campos requeridos faltantes:', missingFields.map(f => f.field))
                    alert(`❌ Campos requeridos faltantes:\n\n${missingLabels}\n\nPor favor completa estos campos antes de continuar.`)
                    return
                  }
                  
                  // Validar teléfono
                  if (!phoneValue || phoneValue.length < 8) {
                    console.error('❌ Teléfono inválido:', phoneValue)
                    alert('❌ Teléfono requerido\n\nPor favor ingresa un teléfono válido con código de país.')
                    return
                  }
                  
                  // Validar teléfono de emergencia (opcional pero si se ingresa debe ser válido)
                  if (emergencyPhoneValue && emergencyPhoneValue.length < 8) {
                    console.error('❌ Teléfono de emergencia inválido:', emergencyPhoneValue)
                    alert('❌ Teléfono de emergencia inválido\n\nPor favor ingresa un teléfono de emergencia válido o déjalo vacío.')
                    return
                  }
                  
                  // Validar tipo de trabajador si es minería
                  if (showWorkerType && !workerType) {
                    console.error('❌ Tipo de trabajador requerido para minería')
                    alert('❌ Tipo de trabajador requerido\n\nPara la industria minera, debes seleccionar el tipo de trabajador (Directo, Indirecto, etc.).')
                    return
                  }
                  
                  // Validar salario (opcional pero si se ingresa debe ser válido)
                  if (salaryValue && (isNaN(parseFloat(salaryValue)) || parseFloat(salaryValue) < 0)) {
                    console.error('❌ Salario inválido:', salaryValue)
                    alert('❌ Salario inválido\n\nPor favor ingresa un salario válido (número positivo) o déjalo vacío.')
                    return
                  }
                  
                  console.log('✅ Validaciones pasadas, enviando datos...')
                  await handleSubmitCollaborator(formData)
                }}
                sx={{
                  textTransform: 'none',
                  minWidth: 160,
                  background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
                  }
                }}
              >
                Guardar Colaborador
              </Button>
            </DialogActions>
          </Dialog>

          {/* Modal de edición de colaborador */}
          <Dialog 
            open={openEditDialog} 
            onClose={() => setOpenEditDialog(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle sx={{ 
              background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
              color: colors.white,
              fontWeight: 600,
              fontSize: '1.2rem'
            }}>
              Editar Colaborador
            </DialogTitle>
            <DialogContent sx={{ p: 3 }}>
              {editingCollaborator && (
                <Box 
                  id="edit-collaborator-form"
                  component="form"
                  display="grid"
                  gridTemplateColumns={{
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(3, 1fr)'
                  }}
                  gap={2}
                  sx={{ mt: 1 }}
                >
                  {/* Información Personal */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Nombres *
                    </Typography>
                    <TextField 
                      name="first_name" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={capitalizeText(editingCollaborator.first_name)}
                      onChange={(e) => {
                        e.target.value = e.target.value
                          .split(' ')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                          .join(' ')
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Apellidos *
                    </Typography>
                    <TextField 
                      name="last_name" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={capitalizeText(editingCollaborator.last_name)}
                      onChange={(e) => {
                        e.target.value = e.target.value
                          .split(' ')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                          .join(' ')
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      RUT / DNI / CI *
                    </Typography>
                    <TextField 
                      name="document" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={editingCollaborator.document}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Email *
                    </Typography>
                    <TextField 
                      name="email" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={editingCollaborator.email}
                      onChange={(e) => {
                        e.target.value = e.target.value.toLowerCase()
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Teléfono *
                    </Typography>
                    <CountryPhoneInput
                      value={phoneValue}
                      onChange={setPhoneValue}
                      defaultCountry={selectedPhoneCountry}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Contacto de Emergencia
                    </Typography>
                    <CountryPhoneInput
                      value={emergencyPhoneValue}
                      onChange={setEmergencyPhoneValue}
                      defaultCountry={selectedEmergencyCountry}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Dirección
                    </Typography>
                    <TextField 
                      name="address" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      defaultValue={capitalizeText(editingCollaborator.address || '')}
                      onChange={(e) => {
                        e.target.value = e.target.value
                          .split(' ')
                          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                          .join(' ')
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Cargo/Posición *
                    </Typography>
                    <Autocomplete
                      freeSolo
                      options={positionOptions}
                      value={positionValue}
                      loading={!industryLoaded}
                      openOnFocus
                      autoHighlight
                      selectOnFocus
                      clearOnBlur
                      handleHomeEndKeys
                      onChange={(event, newValue) => {
                        setPositionValue(newValue || '')
                      }}
                      onInputChange={(event, newInputValue) => {
                        setPositionValue(newInputValue)
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          placeholder="Selecciona o escribe un cargo"
                        />
                      )}
                    />
                  </Box>
                  {showWorkerType && (
                    <Box>
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                        Tipo de Trabajador *
                      </Typography>
                      <TextField
                        select
                        fullWidth
                        variant="outlined"
                        size="small"
                        value={workerType}
                        onChange={(e) => setWorkerType(e.target.value)}
                      >
                        <MenuItem value="Directo">Directo</MenuItem>
                        <MenuItem value="Indirecto">Indirecto</MenuItem>
                        <MenuItem value="Contratista">Contratista</MenuItem>
                        <MenuItem value="Subcontratista">Subcontratista</MenuItem>
                        <MenuItem value="Consultor">Consultor</MenuItem>
                      </TextField>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Salario
                    </Typography>
                    <TextField 
                      name="salary" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      placeholder="Ej: 500000"
                      value={salaryValue}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        setSalaryValue(value)
                      }}
                      onBlur={() => {
                        if (salaryValue && !isNaN(parseFloat(salaryValue))) {
                          const formatted = formatNumber(parseFloat(salaryValue), companyCountry)
                          setSalaryValue(formatted)
                        }
                      }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography variant="body2" sx={{ color: colors.gray6 }}>
                              {companyCountry === 'CL' ? '$' : companyCountry === 'AR' ? '$' : companyCountry === 'PE' ? 'S/' : companyCountry === 'CO' ? '$' : companyCountry === 'MX' ? '$' : companyCountry === 'US' ? '$' : companyCountry === 'BR' ? 'R$' : companyCountry === 'ES' ? '€' : companyCountry === 'DE' ? '€' : companyCountry === 'FR' ? '€' : '$'}
                            </Typography>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Fecha de Nacimiento
                    </Typography>
                    <TextField 
                      name="birth_date" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      type="date"
                      defaultValue={editingCollaborator.birth_date}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Fecha de Ingreso
                    </Typography>
                    <TextField 
                      name="hire_date" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      type="date"
                      defaultValue={editingCollaborator.hire_date}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Ropa Superior
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      name="upper_clothing_size"
                      defaultValue={editingCollaborator.upper_clothing_size}
                    >
                      {clothingSizes.map((size) => (
                        <MenuItem key={size} value={size}>
                          {size}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Ropa Inferior
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      name="lower_clothing_size"
                      defaultValue={editingCollaborator.lower_clothing_size}
                    >
                      {clothingSizes.map((size) => (
                        <MenuItem key={size} value={size}>
                          {size}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Talla de Zapatos
                    </Typography>
                    <TextField 
                      name="shoe_size" 
                      fullWidth 
                      variant="outlined" 
                      size="small" 
                      placeholder="40, 41, 42"
                      defaultValue={editingCollaborator.shoe_size}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Sexo
                    </Typography>
                    <TextField
                      select
                      fullWidth
                      variant="outlined"
                      size="small"
                      name="gender"
                      defaultValue={editingCollaborator.gender}
                    >
                      {genderOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1, fontWeight: 500, color: colors.blue1 }}>
                      Foto del Colaborador
                    </Typography>
                    <input
                      type="file"
                      id="edit-photo-upload"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setPhotoFile(file)
                        }
                      }}
                    />
                    <label htmlFor="edit-photo-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        fullWidth
                        size="small"
                        startIcon={<Add />}
                        sx={{
                          borderColor: colors.gray4,
                          color: colors.blue1,
                          '&:hover': {
                            borderColor: colors.blue6,
                            backgroundColor: colors.blue1 + '10'
                          }
                        }}
                      >
                        {photoFile ? 'Cambiar Foto' : 'Seleccionar Nueva Foto'}
                      </Button>
                    </label>
                    {photoFile && (
                      <Typography variant="caption" sx={{ color: colors.blue6, mt: 1, display: 'block' }}>
                        ✓ {photoFile.name}
                      </Typography>
                    )}
                    {editingCollaborator.photo_url && !photoFile && (
                      <Typography variant="caption" sx={{ color: colors.gray6, mt: 1, display: 'block' }}>
                        📷 Foto actual disponible
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
              <Button 
                onClick={() => setOpenEditDialog(false)}
                variant="outlined"
                sx={{ textTransform: 'none', minWidth: 120 }}
              >
                Cancelar
              </Button>
              <Button 
                variant="contained"
                onClick={async () => {
                  console.log('🔄 Iniciando actualización de colaborador...')
                  
                  // Obtener datos del formulario
                  const form = document.getElementById('edit-collaborator-form') as HTMLFormElement
                  if (!form) {
                    console.error('❌ No se encontró el formulario')
                    alert('Error: No se encontró el formulario')
                    return
                  }
                  
                  const formData = new FormData(form)
                  console.log('📋 Datos del formulario:', Object.fromEntries(formData.entries()))
                  
                  // Validar campos requeridos
                  const requiredFields = [
                    { field: 'first_name', label: 'Nombres' },
                    { field: 'last_name', label: 'Apellidos' },
                    { field: 'document', label: 'RUT/DNI/CI' },
                    { field: 'email', label: 'Email' }
                  ]
                  const missingFields = requiredFields.filter(({ field }) => !formData.get(field))
                  
                  if (missingFields.length > 0) {
                    const missingLabels = missingFields.map(({ label }) => label).join(', ')
                    console.error('❌ Campos requeridos faltantes:', missingFields.map(f => f.field))
                    alert(`❌ Campos requeridos faltantes:\n\n${missingLabels}\n\nPor favor completa estos campos antes de continuar.`)
                    return
                  }
                  
                  // Validar teléfono
                  if (!phoneValue || phoneValue.length < 8) {
                    console.error('❌ Teléfono inválido:', phoneValue)
                    alert('❌ Teléfono requerido\n\nPor favor ingresa un teléfono válido con código de país.')
                    return
                  }
                  
                  // Validar teléfono de emergencia (opcional pero si se ingresa debe ser válido)
                  if (emergencyPhoneValue && emergencyPhoneValue.length < 8) {
                    console.error('❌ Teléfono de emergencia inválido:', emergencyPhoneValue)
                    alert('❌ Teléfono de emergencia inválido\n\nPor favor ingresa un teléfono de emergencia válido o déjalo vacío.')
                    return
                  }
                  
                  // Validar tipo de trabajador si es minería
                  if (showWorkerType && !workerType) {
                    console.error('❌ Tipo de trabajador requerido para minería')
                    alert('❌ Tipo de trabajador requerido\n\nPara la industria minera, debes seleccionar el tipo de trabajador (Directo, Indirecto, etc.).')
                    return
                  }
                  
                  // Validar salario (opcional pero si se ingresa debe ser válido)
                  if (salaryValue && (isNaN(parseFloat(salaryValue)) || parseFloat(salaryValue) < 0)) {
                    console.error('❌ Salario inválido:', salaryValue)
                    alert('❌ Salario inválido\n\nPor favor ingresa un salario válido (número positivo) o déjalo vacío.')
                    return
                  }
                  
                  console.log('✅ Validaciones pasadas, enviando datos...')
                  await handleUpdateCollaborator(formData)
                }}
                sx={{
                  textTransform: 'none',
                  minWidth: 160,
                  background: `linear-gradient(135deg, ${colors.blue6} 0%, ${colors.blue8} 100%)`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${colors.blue4} 0%, ${colors.blue6} 100%)`,
                  }
                }}
              >
                Actualizar Colaborador
              </Button>
            </DialogActions>
          </Dialog>
        </Container>
      </Box>
    </Box>
  )
}
