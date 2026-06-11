#!/usr/bin/env node
/**
 * Script para verificar las columnas de la tabla pr_field_reports
 * y detectar si faltan las columnas necesarias
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
  console.log('🔍 Verificando estructura de pr_field_reports...\n')

  // Primero obtener un company_id válido
  const { data: companies } = await supabase.from('pr_companies').select('id').limit(1)
  const companyId = companies && companies.length > 0 ? companies[0].id : null

  if (!companyId) {
    console.error('❌ No se encontró ninguna compañía en pr_companies')
    return
  }

  console.log('✅ Usando company_id:', companyId)
  console.log('🔄 Intentando insertar un registro de prueba con todas las columnas...\n')
  
  // Intentar insertar con todas las columnas para ver qué falla
  const testPayload = {
    company_id: companyId,
    date: '2025-12-15',
    supervisor_id: null,
    capataz_id: null,
    specialty: 'test',
    crew_id: null,
    crew_name: 'test',
    weather: {},
    turno: 'Dia',
    area: 'test',
    start_time: '08:00',
    end_time: '17:00',
    activities: [],
    assignments: [],
    restrictions: '',
    personnel: [],
    personnel_ids: [],
    person_hours: {},
    equipment_entries: [],
    equipment_hours: {},
    activity_observations: {}
  }

  const { data: insertData, error: insertError } = await supabase
    .from('pr_field_reports')
    .insert(testPayload)
    .select()

  if (insertError) {
    console.error('❌ Error al insertar registro de prueba:')
    console.error('   Mensaje:', insertError.message)
    console.error('   Detalles:', insertError.details)
    console.error('   Hint:', insertError.hint)
    console.log('\n💡 Esto indica que algunas columnas no existen en la tabla.')
    console.log('📝 Debes aplicar la migración en Supabase:')
    console.log('   1. Abre https://juupotamdjqzpxuqdtco.supabase.co/project/_/sql/new')
    console.log('   2. Copia y pega el contenido de: migrations/2025-12-15_add_pr_field_reports_columns.sql')
    console.log('   3. Ejecuta el SQL\n')
  } else {
    console.log('✅ Todas las columnas existen y el insert funcionó.')
    console.log('📋 Datos guardados:', JSON.stringify(insertData[0], null, 2))
    console.log('\n🗑️  Eliminando registro de prueba...')
    await supabase.from('pr_field_reports').delete().eq('id', insertData[0].id)
    console.log('✅ Limpieza completada.')
  }
}

checkSchema()
