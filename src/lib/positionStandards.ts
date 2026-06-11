import { IndustryType } from '../types'

// Cargos estandarizados por industria
export const POSITION_STANDARDS: Record<IndustryType, string[]> = {
  [IndustryType.TECHNOLOGY]: [
    // Desarrollo de Software
    'Desarrollador Frontend',
    'Desarrollador Backend', 
    'Desarrollador Full Stack',
    'Desarrollador Mobile',
    'Desarrollador Web',
    'Desarrollador de Videojuegos',
    'Desarrollador de Aplicaciones',
    'Desarrollador de Sistemas',
    'Desarrollador de APIs',
    'Desarrollador de Microservicios',
    'Desarrollador de Blockchain',
    'Desarrollador de IA',
    'Desarrollador de Machine Learning',
    'Desarrollador de Data Science',
    'Desarrollador de DevOps',
    'Desarrollador de Cloud',
    'Desarrollador de Seguridad',
    'Desarrollador de Testing',
    'Desarrollador de Automatización',
    'Desarrollador de Integración',
    
    // Ingeniería
    'Ingeniero de Software',
    'Ingeniero de Sistemas',
    'Ingeniero de Redes',
    'Ingeniero de Telecomunicaciones',
    'Ingeniero de Hardware',
    'Ingeniero de Firmware',
    'Ingeniero de DevOps',
    'Ingeniero de Cloud',
    'Ingeniero de Seguridad',
    'Ingeniero de Datos',
    'Ingeniero de Machine Learning',
    'Ingeniero de IA',
    'Ingeniero de Blockchain',
    'Ingeniero de IoT',
    'Ingeniero de Automatización',
    'Ingeniero de Testing',
    'Ingeniero de Performance',
    'Ingeniero de Escalabilidad',
    'Ingeniero de Integración',
    'Ingeniero de APIs',
    
    // Arquitectura
    'Arquitecto de Software',
    'Arquitecto de Sistemas',
    'Arquitecto de Datos',
    'Arquitecto de Cloud',
    'Arquitecto de Seguridad',
    'Arquitecto de Redes',
    'Arquitecto de Soluciones',
    'Arquitecto de Enterprise',
    'Arquitecto de Microservicios',
    'Arquitecto de APIs',
    'Arquitecto de Blockchain',
    'Arquitecto de IA',
    'Arquitecto de Machine Learning',
    'Arquitecto de IoT',
    'Arquitecto de Automatización',
    'Arquitecto de Testing',
    'Arquitecto de Performance',
    'Arquitecto de Escalabilidad',
    'Arquitecto de Integración',
    'Arquitecto de DevOps',
    
    // Base de Datos
    'Ingeniero de Base de Datos',
    'Administrador de Base de Datos',
    'Analista de Base de Datos',
    'Arquitecto de Base de Datos',
    'Especialista en Base de Datos',
    'Consultor de Base de Datos',
    'Desarrollador de Base de Datos',
    'Técnico de Base de Datos',
    'Coordinador de Base de Datos',
    'Supervisor de Base de Datos',
    'Jefe de Base de Datos',
    'Gerente de Base de Datos',
    'Director de Base de Datos',
    'Especialista en SQL',
    'Especialista en NoSQL',
    'Especialista en Big Data',
    'Especialista en Data Warehouse',
    'Especialista en Data Lake',
    'Especialista en Data Mining',
    'Especialista en Data Analytics',
    
    // Análisis
    'Analista de Sistemas',
    'Analista de Negocios',
    'Analista de Datos',
    'Analista de Procesos',
    'Analista de Requerimientos',
    'Analista de Calidad',
    'Analista de Seguridad',
    'Analista de Performance',
    'Analista de Testing',
    'Analista de Integración',
    'Analista de APIs',
    'Analista de Cloud',
    'Analista de DevOps',
    'Analista de Machine Learning',
    'Analista de IA',
    'Analista de Blockchain',
    'Analista de IoT',
    'Analista de Automatización',
    'Analista de Escalabilidad',
    'Analista de Costos',
    
    // Gestión de Proyectos
    'Product Manager',
    'Project Manager',
    'Program Manager',
    'Scrum Master',
    'Agile Coach',
    'Product Owner',
    'Business Analyst',
    'Requirements Analyst',
    'Stakeholder Manager',
    'Risk Manager',
    'Quality Manager',
    'Delivery Manager',
    'Release Manager',
    'Change Manager',
    'Configuration Manager',
    'Portfolio Manager',
    'Resource Manager',
    'Budget Manager',
    'Timeline Manager',
    'Scope Manager',
    
    // Testing y QA
    'QA Engineer',
    'Test Engineer',
    'Automation Engineer',
    'Performance Engineer',
    'Security Engineer',
    'Mobile QA Engineer',
    'Web QA Engineer',
    'API QA Engineer',
    'Database QA Engineer',
    'Cloud QA Engineer',
    'DevOps QA Engineer',
    'Machine Learning QA Engineer',
    'IA QA Engineer',
    'Blockchain QA Engineer',
    'IoT QA Engineer',
    'Test Automation Engineer',
    'Test Data Engineer',
    'Test Environment Engineer',
    'Test Infrastructure Engineer',
    'Test Tools Engineer',
    
    // Diseño
    'UX/UI Designer',
    'UX Designer',
    'UI Designer',
    'Product Designer',
    'Interaction Designer',
    'Visual Designer',
    'Graphic Designer',
    'Web Designer',
    'Mobile Designer',
    'Game Designer',
    'User Researcher',
    'Usability Engineer',
    'Information Architect',
    'Content Strategist',
    'Design System Manager',
    'Creative Director',
    'Art Director',
    'Brand Designer',
    'Marketing Designer',
    'Social Media Designer',
    
    // Data Science
    'Data Scientist',
    'Data Analyst',
    'Data Engineer',
    'Data Architect',
    'Machine Learning Engineer',
    'Machine Learning Scientist',
    'AI Engineer',
    'AI Scientist',
    'Deep Learning Engineer',
    'Computer Vision Engineer',
    'NLP Engineer',
    'Big Data Engineer',
    'Data Mining Engineer',
    'Statistical Analyst',
    'Quantitative Analyst',
    'Business Intelligence Analyst',
    'Data Visualization Specialist',
    'Data Governance Specialist',
    'Data Quality Specialist',
    'Data Security Specialist',
    
    // Cloud y DevOps
    'Cloud Engineer',
    'DevOps Engineer',
    'Site Reliability Engineer',
    'Infrastructure Engineer',
    'Platform Engineer',
    'Automation Engineer',
    'CI/CD Engineer',
    'Container Engineer',
    'Kubernetes Engineer',
    'Docker Engineer',
    'AWS Engineer',
    'Azure Engineer',
    'GCP Engineer',
    'Cloud Architect',
    'DevOps Architect',
    'Infrastructure Architect',
    'Platform Architect',
    'Automation Architect',
    'CI/CD Architect',
    'Container Architect',
    
    // Seguridad
    'Cybersecurity Engineer',
    'Security Engineer',
    'Information Security Analyst',
    'Security Architect',
    'Penetration Tester',
    'Security Consultant',
    'Security Manager',
    'Security Director',
    'CISO',
    'Security Operations Center Analyst',
    'Incident Response Specialist',
    'Threat Intelligence Analyst',
    'Vulnerability Assessment Specialist',
    'Security Compliance Specialist',
    'Security Awareness Specialist',
    'Security Training Specialist',
    'Security Policy Specialist',
    'Security Risk Specialist',
    'Security Audit Specialist',
    'Security Governance Specialist',
    
    // Liderazgo Técnico
    'Technical Lead',
    'Engineering Manager',
    'Development Manager',
    'Software Engineering Manager',
    'Data Engineering Manager',
    'DevOps Manager',
    'Cloud Manager',
    'Security Manager',
    'QA Manager',
    'Testing Manager',
    'Product Engineering Manager',
    'Platform Engineering Manager',
    'Infrastructure Manager',
    'IT Manager',
    'Technology Manager',
    'Innovation Manager',
    'Research Manager',
    'Development Director',
    'Engineering Director',
    'CTO',
    
    // Especialistas
    'Blockchain Developer',
    'Blockchain Engineer',
    'Blockchain Architect',
    'Blockchain Consultant',
    'Blockchain Analyst',
    'Cryptocurrency Developer',
    'Smart Contract Developer',
    'DeFi Developer',
    'NFT Developer',
    'Web3 Developer',
    'IoT Developer',
    'IoT Engineer',
    'IoT Architect',
    'IoT Consultant',
    'IoT Analyst',
    'Embedded Systems Developer',
    'Firmware Developer',
    'Hardware Engineer',
    'Electronics Engineer',
    'Robotics Engineer'
  ],
  [IndustryType.CONSTRUCTION]: [
    'Ingeniero Civil',
    'Arquitecto',
    'Jefe de Obra',
    'Supervisor de Construcción',
    'Maestro de Obra',
    'Obrero Especializado',
    'Obrero General',
    'Electricista',
    'Plomero',
    'Soldador',
    'Operador de Maquinaria',
    'Seguridad y Salud Ocupacional',
    'Topógrafo',
    'Dibujante Técnico',
    'Gerente de Proyecto',
    'Coordinador de Obra',
    'Inspector de Calidad',
    'Administrador de Contrato'
  ],
  [IndustryType.HEALTHCARE]: [
    'Médico General',
    'Médico Especialista',
    'Enfermero/a',
    'Técnico en Enfermería',
    'Farmacéutico',
    'Técnico de Laboratorio',
    'Radiólogo',
    'Fisioterapeuta',
    'Psicólogo',
    'Nutricionista',
    'Administrativo de Salud',
    'Recepcionista',
    'Auxiliar de Enfermería',
    'Director Médico',
    'Gerente de Hospital',
    'Coordinador de Servicios',
    'Técnico en Emergencias'
  ],
  [IndustryType.EDUCATION]: [
    'Profesor de Educación Básica',
    'Profesor de Educación Media',
    'Profesor Universitario',
    'Coordinador Académico',
    'Director de Establecimiento',
    'Subdirector',
    'Inspector General',
    'Orientador',
    'Psicólogo Educacional',
    'Bibliotecario',
    'Administrativo de Educación',
    'Auxiliar de Aula',
    'Técnico en Educación',
    'Coordinador de Convivencia',
    'Jefe de UTP',
    'Secretario/a',
    'Conserje',
    'Auxiliar de Servicios'
  ],
  [IndustryType.OTHER]: [
    'Gerente General',
    'Gerente de Operaciones',
    'Gerente de Recursos Humanos',
    'Gerente de Ventas',
    'Gerente de Marketing',
    'Contador',
    'Asistente Administrativo',
    'Secretario/a',
    'Recepcionista',
    'Vendedor',
    'Ejecutivo de Ventas',
    'Analista',
    'Coordinador',
    'Supervisor',
    'Jefe de Área',
    'Director',
    'Consultor',
    'Freelancer'
  ]
}

// Cargos para industrias personalizadas - EXPANDIDO
export const CUSTOM_INDUSTRY_POSITIONS: Record<string, string[]> = {
  'Minería': [
    // Ingeniería y Geología
    'Ingeniero de Minas',
    'Ingeniero Civil',
    'Ingeniero Geólogo',
    'Ingeniero de Seguridad',
    'Ingeniero de Proyectos',
    'Geólogo',
    'Geólogo Senior',
    'Geólogo de Exploración',
    'Geólogo de Producción',
    'Hidrogeólogo',
    'Geofísico',
    'Topógrafo',
    'Ingeniero de Procesos',
    'Ingeniero de Mantenimiento',
    'Ingeniero Mecánico',
    'Ingeniero Eléctrico',
    'Ingeniero de Medio Ambiente',
    'Ingeniero de Ventilación',
    'Ingeniero de Drenaje',
    'Ingeniero de Estructuras',
    
    // Supervisión y Operaciones
    'Supervisor de Mina',
    'Supervisor de Seguridad',
    'Supervisor de Producción',
    'Supervisor de Mantenimiento',
    'Supervisor de Logística',
    'Supervisor de Personal',
    'Supervisor de Turno',
    'Supervisor de Operaciones',
    'Supervisor de Calidad',
    'Supervisor de Medio Ambiente',
    'Supervisor de Almacén',
    'Supervisor de Transporte',
    'Supervisor de Planta',
    'Supervisor de Laboratorio',
    'Supervisor de Explosivos',
    'Supervisor de Ventilación',
    'Supervisor de Drenaje',
    'Supervisor de Energía',
    'Supervisor de Comunicaciones',
    'Supervisor de IT',
    
    // Operadores y Técnicos
    'Operador de Maquinaria Minera',
    'Operador de Camión Minero',
    'Operador de Excavadora',
    'Operador de Bulldozer',
    'Operador de Grúa',
    'Operador de Planta',
    'Operador de Sala de Control',
    'Operador de Equipos Pesados',
    'Operador de Perforadora',
    'Operador de Cargador',
    'Operador de Motoniveladora',
    'Operador de Compactador',
    'Operador de Retroexcavadora',
    'Operador de Pala Hidráulica',
    'Operador de Dragalina',
    'Operador de Equipos de Perforación',
    'Operador de Equipos de Carga',
    'Operador de Equipos de Transporte',
    'Operador de Equipos de Acarreo',
    'Operador de Equipos de Apilamiento',
    
    // Técnicos Especializados
    'Técnico en Explosivos',
    'Técnico en Mantenimiento',
    'Técnico en Electricidad',
    'Técnico en Mecánica',
    'Técnico en Instrumentación',
    'Técnico en Automatización',
    'Técnico en Soldadura',
    'Técnico en Refrigeración',
    'Técnico en Hidráulica',
    'Técnico en Neumática',
    'Técnico en Laboratorio',
    'Técnico en Calidad',
    'Técnico en Medio Ambiente',
    'Técnico en Seguridad',
    'Técnico en Ventilación',
    'Técnico en Drenaje',
    'Técnico en Energía',
    'Técnico en Comunicaciones',
    'Técnico en IT',
    'Técnico en Geología',
    
    // Jefaturas y Coordinación
    'Jefe de Turno',
    'Jefe de Área',
    'Jefe de Mina',
    'Jefe de Planta',
    'Jefe de Mantenimiento',
    'Jefe de Seguridad',
    'Jefe de Logística',
    'Jefe de Personal',
    'Jefe de Operaciones',
    'Jefe de Calidad',
    'Jefe de Medio Ambiente',
    'Jefe de Laboratorio',
    'Jefe de Almacén',
    'Jefe de Transporte',
    'Jefe de Energía',
    'Jefe de Comunicaciones',
    'Jefe de IT',
    'Jefe de Proyectos',
    'Jefe de Exploración',
    'Jefe de Producción',
    
    // Gerencia y Administración
    'Gerente de Operaciones',
    'Gerente de Mina',
    'Gerente de Planta',
    'Gerente de Mantenimiento',
    'Gerente de Seguridad',
    'Gerente de Logística',
    'Gerente de Personal',
    'Gerente de Calidad',
    'Gerente de Medio Ambiente',
    'Gerente de Laboratorio',
    'Gerente de Almacén',
    'Gerente de Transporte',
    'Gerente de Energía',
    'Gerente de Comunicaciones',
    'Gerente de IT',
    'Gerente de Proyectos',
    'Gerente de Exploración',
    'Gerente de Producción',
    'Gerente General',
    'Director de Operaciones',
    
    // Especialistas
    'Especialista en Seguridad',
    'Especialista en Medio Ambiente',
    'Especialista en Calidad',
    'Especialista en Procesos',
    'Especialista en Mantenimiento',
    'Especialista en Logística',
    'Especialista en Personal',
    'Especialista en Energía',
    'Especialista en Comunicaciones',
    'Especialista en IT',
    'Especialista en Proyectos',
    'Especialista en Exploración',
    'Especialista en Producción',
    'Especialista en Geología',
    'Especialista en Ventilación',
    'Especialista en Drenaje',
    'Especialista en Explosivos',
    'Especialista en Laboratorio',
    'Especialista en Almacén',
    'Especialista en Transporte',
    
    // Coordinadores
    'Coordinador de Proyectos',
    'Coordinador de Operaciones',
    'Coordinador de Mantenimiento',
    'Coordinador de Seguridad',
    'Coordinador de Logística',
    'Coordinador de Personal',
    'Coordinador de Calidad',
    'Coordinador de Medio Ambiente',
    'Coordinador de Laboratorio',
    'Coordinador de Almacén',
    'Coordinador de Transporte',
    'Coordinador de Energía',
    'Coordinador de Comunicaciones',
    'Coordinador de IT',
    'Coordinador de Exploración',
    'Coordinador de Producción',
    'Coordinador de Ventilación',
    'Coordinador de Drenaje',
    'Coordinador de Explosivos',
    'Coordinador de Capacitación',
    
    // Analistas
    'Analista de Laboratorio',
    'Analista de Procesos',
    'Analista de Calidad',
    'Analista de Seguridad',
    'Analista de Medio Ambiente',
    'Analista de Logística',
    'Analista de Personal',
    'Analista de Energía',
    'Analista de Comunicaciones',
    'Analista de IT',
    'Analista de Proyectos',
    'Analista de Exploración',
    'Analista de Producción',
    'Analista de Geología',
    'Analista de Ventilación',
    'Analista de Drenaje',
    'Analista de Explosivos',
    'Analista de Almacén',
    'Analista de Transporte',
    'Analista de Costos',
    
    // Administrativos
    'Administrador de Contrato',
    'Administrador de Proyectos',
    'Administrador de Personal',
    'Administrador de Almacén',
    'Administrador de Transporte',
    'Administrador de Energía',
    'Administrador de Comunicaciones',
    'Administrador de IT',
    'Administrador de Seguridad',
    'Administrador de Calidad',
    'Administrador de Medio Ambiente',
    'Administrador de Laboratorio',
    'Administrador de Logística',
    'Administrador de Mantenimiento',
    'Administrador de Operaciones',
    'Administrador de Exploración',
    'Administrador de Producción',
    'Administrador de Ventilación',
    'Administrador de Drenaje',
    'Administrador de Explosivos',
    
    // Obreros y Auxiliares
    'Obrero Minero',
    'Obrero de Mantenimiento',
    'Obrero de Planta',
    'Obrero de Almacén',
    'Obrero de Transporte',
    'Obrero de Seguridad',
    'Obrero de Limpieza',
    'Obrero de Jardinería',
    'Obrero de Construcción',
    'Obrero de Demolición',
    'Obrero de Excavación',
    'Obrero de Perforación',
    'Obrero de Carga',
    'Obrero de Descarga',
    'Obrero de Apilamiento',
    'Obrero de Compactación',
    'Obrero de Nivelación',
    'Obrero de Drenaje',
    'Obrero de Ventilación',
    'Obrero de Electricidad',
    
    // Auxiliares
    'Auxiliar de Mina',
    'Auxiliar de Planta',
    'Auxiliar de Mantenimiento',
    'Auxiliar de Seguridad',
    'Auxiliar de Logística',
    'Auxiliar de Personal',
    'Auxiliar de Calidad',
    'Auxiliar de Medio Ambiente',
    'Auxiliar de Laboratorio',
    'Auxiliar de Almacén',
    'Auxiliar de Transporte',
    'Auxiliar de Energía',
    'Auxiliar de Comunicaciones',
    'Auxiliar de IT',
    'Auxiliar de Proyectos',
    'Auxiliar de Exploración',
    'Auxiliar de Producción',
    'Auxiliar de Ventilación',
    'Auxiliar de Drenaje',
    'Auxiliar de Explosivos',
    
    // Personal de Apoyo
    'Conductor de Camión',
    'Conductor de Bus',
    'Conductor de Vehículo Liviano',
    'Conductor de Equipo Pesado',
    'Conductor de Grúa',
    'Conductor de Excavadora',
    'Conductor de Bulldozer',
    'Conductor de Motoniveladora',
    'Conductor de Compactador',
    'Conductor de Retroexcavadora',
    'Conductor de Pala Hidráulica',
    'Conductor de Dragalina',
    'Conductor de Perforadora',
    'Conductor de Cargador',
    'Conductor de Equipos de Perforación',
    'Conductor de Equipos de Carga',
    'Conductor de Equipos de Transporte',
    'Conductor de Equipos de Acarreo',
    'Conductor de Equipos de Apilamiento',
    'Conductor de Equipos de Nivelación',
    
    // Personal de Seguridad
    'Guardia de Seguridad',
    'Guardia de Mina',
    'Guardia de Planta',
    'Guardia de Almacén',
    'Guardia de Transporte',
    'Guardia de Energía',
    'Guardia de Comunicaciones',
    'Guardia de IT',
    'Guardia de Proyectos',
    'Guardia de Exploración',
    'Guardia de Producción',
    'Guardia de Ventilación',
    'Guardia de Drenaje',
    'Guardia de Explosivos',
    'Guardia de Laboratorio',
    'Guardia de Mantenimiento',
    'Guardia de Logística',
    'Guardia de Personal',
    'Guardia de Calidad',
    'Guardia de Medio Ambiente',
    
    // Personal de Limpieza
    'Personal de Limpieza',
    'Personal de Jardinería',
    'Personal de Mantenimiento de Edificios',
    'Personal de Limpieza Industrial',
    'Personal de Limpieza de Equipos',
    'Personal de Limpieza de Instalaciones',
    'Personal de Limpieza de Oficinas',
    'Personal de Limpieza de Baños',
    'Personal de Limpieza de Comedores',
    'Personal de Limpieza de Vestuarios',
    'Personal de Limpieza de Talleres',
    'Personal de Limpieza de Laboratorios',
    'Personal de Limpieza de Almacenes',
    'Personal de Limpieza de Transporte',
    'Personal de Limpieza de Energía',
    'Personal de Limpieza de Comunicaciones',
    'Personal de Limpieza de IT',
    'Personal de Limpieza de Proyectos',
    'Personal de Limpieza de Exploración',
    'Personal de Limpieza de Producción'
  ],
  'Manufactura': [
    'Operario de Producción',
    'Supervisor de Línea',
    'Técnico en Calidad',
    'Ingeniero de Producción',
    'Operador de Máquinas',
    'Supervisor de Turno',
    'Técnico en Mantenimiento',
    'Coordinador de Producción',
    'Analista de Procesos',
    'Supervisor de Almacén',
    'Técnico en Seguridad',
    'Operador de Grúa',
    'Soldador',
    'Mecánico Industrial',
    'Supervisor de Personal',
    'Jefe de Planta',
    'Coordinador de Logística',
    'Administrador de Producción'
  ],
  'Retail': [
    'Vendedor',
    'Cajero',
    'Supervisor de Ventas',
    'Gerente de Tienda',
    'Asistente de Ventas',
    'Reponedor',
    'Supervisor de Almacén',
    'Coordinador de Merchandising',
    'Analista de Ventas',
    'Supervisor de Personal',
    'Coordinador de Marketing',
    'Asistente Administrativo',
    'Operador de Grúa',
    'Supervisor de Logística',
    'Coordinador de Inventario',
    'Gerente de Área',
    'Analista de Datos',
    'Coordinador de Capacitación'
  ]
}

// Función para obtener cargos sugeridos basados en industria
export function getSuggestedPositions(industry: IndustryType | string): string[] {
  // Si es una industria personalizada (string)
  if (typeof industry === 'string') {
    const customPositions = CUSTOM_INDUSTRY_POSITIONS[industry]
    
    if (customPositions) {
      return customPositions
    }
    
    // Si no encuentra en personalizadas, buscar en estándar
    return POSITION_STANDARDS[IndustryType.OTHER]
  }
  
  // Si es un enum estándar
  return POSITION_STANDARDS[industry] || POSITION_STANDARDS[IndustryType.OTHER]
}

// Función para validar si un cargo es estándar
export function isStandardPosition(position: string, industry: IndustryType | string): boolean {
  const standardPositions = getSuggestedPositions(industry)
  return standardPositions.some(standard => 
    standard.toLowerCase() === position.toLowerCase()
  )
}

// Función para encontrar cargos similares (evitar duplicados)
export function findSimilarPositions(position: string, industry: IndustryType | string): string[] {
  const standardPositions = getSuggestedPositions(industry)
  const searchTerm = position.toLowerCase()
  
  return standardPositions.filter(standard => 
    standard.toLowerCase().includes(searchTerm) ||
    searchTerm.includes(standard.toLowerCase()) ||
    // Algoritmo de similitud simple
    calculateSimilarity(standard.toLowerCase(), searchTerm) > 0.7
  )
}

// Función para agregar un cargo personalizado a la lista
export function addCustomPosition(position: string, industry: IndustryType | string): void {
  // En una implementación real, esto guardaría en la base de datos
  // Por ahora solo mostramos un mensaje en desarrollo
  if (process.env.NODE_ENV === 'development') {
    console.debug(`Cargo personalizado agregado: ${position} para industria ${industry}`)
  }
}

// Función para validar si un cargo personalizado es válido
export function validateCustomPosition(position: string): { isValid: boolean; message?: string } {
  if (!position || position.trim().length < 2) {
    return { isValid: false, message: 'El cargo debe tener al menos 2 caracteres' }
  }
  
  if (position.length > 100) {
    return { isValid: false, message: 'El cargo no puede exceder 100 caracteres' }
  }
  
  // Validar caracteres especiales
  const invalidChars = /[<>{}[\]\\|`~!@#$%^&*()+=]/
  if (invalidChars.test(position)) {
    return { isValid: false, message: 'El cargo contiene caracteres no válidos' }
  }
  
  return { isValid: true }
}

// Función para obtener estadísticas de cargos por industria
export function getPositionStats(industry: IndustryType | string): {
  totalPositions: number
  categories: Record<string, number>
  industryName: string
} {
  const positions = getSuggestedPositions(industry)
  const categories: Record<string, number> = {}
  
  positions.forEach(position => {
    const category = position.split(' ')[0] // Primera palabra como categoría
    categories[category] = (categories[category] || 0) + 1
  })
  
  return {
    totalPositions: positions.length,
    categories,
    industryName: typeof industry === 'string' ? industry.toLowerCase() : 'unknown'
  }
}

// Función de similitud simple (Levenshtein distance)
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}
