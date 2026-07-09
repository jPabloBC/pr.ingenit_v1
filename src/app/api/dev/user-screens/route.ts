import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { requireApiAccess } from '@/lib/apiAccess'

function humanize(name: string) {
  return name.replace(/[-_]/g, ' ')
}

async function walkDir(dir: string, baseRoute = '/users') {
  const results: Array<{ key: string; label: string; path: string }> = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      // recurse
      const nested = await walkDir(full, `${baseRoute}/${e.name}`)
      results.push(...nested)
      // also consider folder-level page.tsx
      const pageFile = path.join(full, 'page.tsx')
      try {
        await fs.access(pageFile)
        const routePath = `${baseRoute}/${e.name}`
        const key = routePath.replace('/users/', '').replace(/\//g, '-')
        results.push({ key, label: humanize(e.name), path: routePath })
      } catch (err) {
        // no folder-level page
      }
    } else if (e.isFile()) {
      if (e.name === 'page.tsx') {
        // top-level users page -> /users
        const routePath = baseRoute
        const key = routePath.replace('/users/', '') || 'dashboard'
        results.push({ key, label: humanize(path.basename(routePath)), path: routePath })
      } else if (e.name.endsWith('.tsx') && e.name !== 'layout.tsx') {
        const name = e.name.replace(/\.tsx?$/, '')
        const routePath = `${baseRoute}/${name}`
        const key = routePath.replace('/users/', '').replace(/\//g, '-')
        results.push({ key, label: humanize(name), path: routePath })
      }
    }
  }

  return results
}

export async function GET() {
  try {
    const access = await requireApiAccess({ resource: 'admin-permissions' })
    if (!access.ok) return access.response

    const usersDir = path.join(process.cwd(), 'src', 'app', 'users')
    const screens = await walkDir(usersDir)

    // dedupe by key
    const map = new Map<string, { key: string; label: string; path: string }>()
    for (const s of screens) map.set(s.key, s)

    const list = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
    return NextResponse.json({ screens: list })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
