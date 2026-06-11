const xlsx = require('xlsx')
const path = './data/REPORT_STRACON.xlsx'
try {
  const wb = xlsx.readFile(path)
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null })
  console.log(JSON.stringify({ sheetName, rowCount: rows.length, rows: rows.slice(0, 200) }, null, 2))
} catch (err) {
  console.error('ERROR_READING_EXCEL:', String(err))
  process.exit(1)
}
