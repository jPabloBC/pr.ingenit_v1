import fs from 'fs'
import path from 'path'

const gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
const packageVersionFromEnv = process.env.npm_package_version
const packageVersionFromFile = (() => {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    return String(parsed?.version || '').trim() || undefined
  } catch {
    return undefined
  }
})()
const packageVersion = packageVersionFromEnv || packageVersionFromFile
const explicitAppVersion =
  process.env.NEXT_PUBLIC_APP_VERSION ||
  process.env.APP_VERSION
const buildVersion =
  packageVersion ||
  explicitAppVersion ||
  gitSha ||
  'local'

const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  env: {
    NEXT_PUBLIC_APP_VERSION: buildVersion,
  },
  webpack(config) {
    config.resolve.alias['@'] = path.resolve(process.cwd(), 'src')
    return config
  }
}

export default nextConfig
