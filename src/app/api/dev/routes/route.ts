import { readdirSync, statSync } from 'fs'
import path from 'path'
import { requireApiAccess } from '@/lib/apiAccess'

function humanize(name: string) {
  if (!name) return name
  // remove extension
  const n = name.replace(/\.tsx?$|\.jsx?$/,'')
  // replace dashes/underscores
  return n.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function GET() {
  try {
    const access = await requireApiAccess({ resource: 'admin-permissions' })
    if (!access.ok) return access.response

    const base = path.join(process.cwd(), 'src', 'app', 'dev')
    const entries = readdirSync(base, { withFileTypes: true })
    const routes: Array<{ path: string; text: string }> = []

    // include root /dev if page.tsx exists
    try {
      const pageFile = path.join(base, 'page.tsx')
      // if exists, include /dev
      if (statSync(pageFile)) {
        routes.push({ path: '/dev', text: 'Inicio Dev' })
      }
    } catch {}

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const entryPath = path.join(base, entry.name)
      if (entry.isDirectory()) {
        // include if has page.tsx
        try {
          const p = path.join(entryPath, 'page.tsx')
          if (statSync(p)) {
            routes.push({ path: `/dev/${entry.name}`, text: humanize(entry.name) })
            // also include nested dynamic pages like [companyId]
            const sub = readdirSync(entryPath, { withFileTypes: true })
            for (const s of sub) {
              if (s.isDirectory()) {
                const sp = path.join(entryPath, s.name, 'page.tsx')
                try {
                  if (statSync(sp)) {
                    // show as parent/:param
                    const name = s.name.replace(/\[|\]/g, '')
                    routes.push({ path: `/dev/${entry.name}/${name}`, text: `${humanize(entry.name)} ${humanize(name)}` })
                  }
                } catch {}
              }
            }
          }
        } catch {}
      } else {
        // file entry like page.tsx or other
        if (entry.name === 'page.tsx') continue
        const ext = path.extname(entry.name)
        if (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) {
          const name = entry.name.replace(ext, '')
          routes.push({ path: `/dev/${name}`, text: humanize(name) })
        }
      }
    }

    return new Response(JSON.stringify({ routes }), { status: 200 })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
