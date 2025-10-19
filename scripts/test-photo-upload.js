// Script para probar la funcionalidad de subida de fotos
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Cargar variables de entorno
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables de entorno de Supabase no encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testPhotoUpload() {
  try {
    // 1. Crear un archivo de prueba (imagen pequeña)
    const testImagePath = path.join(process.cwd(), 'test-photo-upload.html')
    
    // Crear un archivo HTML simple como archivo de prueba
    const testContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Photo Upload</title>
</head>
<body>
    <h1>Test Photo Upload</h1>
    <p>Este es un archivo de prueba para verificar la funcionalidad de subida de fotos.</p>
</body>
</html>
`
    
    fs.writeFileSync(testImagePath, testContent)
    
    // 2. Simular la estructura de carpetas
    const companyId = 'test-company-uuid'
    const collaboratorId = 'test-collaborator-uuid'
    const fileName = `test-${Date.now()}.html`
    const filePath = `companies/${companyId}/collaborators/${collaboratorId}/${fileName}`
    
    // 3. Leer el archivo como buffer
    const fileBuffer = fs.readFileSync(testImagePath)
    
    // 4. Subir el archivo
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('collaborator-photos')
      .upload(filePath, fileBuffer, {
        contentType: 'text/html',
        cacheControl: '3600'
      })
    
    if (uploadError) {
      console.error('❌ Error subiendo archivo:', uploadError)
      return
    }
    
    // 5. Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('collaborator-photos')
      .getPublicUrl(filePath)
    
    // 6. Verificar que el archivo se puede descargar
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('collaborator-photos')
      .download(filePath)
    
    if (downloadError) {
      console.error('❌ Error descargando archivo:', downloadError)
      return
    }
    
    // 7. Listar archivos en la carpeta del colaborador
    const { data: files, error: listError } = await supabase.storage
      .from('collaborator-photos')
      .list(`companies/${companyId}/collaborators/${collaboratorId}`)
    
    if (listError) {
      console.error('❌ Error listando archivos:', listError)
    } 
    
    // 8. Limpiar archivo de prueba
    fs.unlinkSync(testImagePath)
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error)
  }
}

// Ejecutar prueba
testPhotoUpload()
