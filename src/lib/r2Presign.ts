import crypto from 'crypto'

type PresignParams = {
  method: 'GET' | 'PUT' | 'DELETE'
  bucket: string
  accountId: string
  key: string
  accessKeyId: string
  secretAccessKey: string
  expiresInSeconds?: number
  contentType?: string
}

const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

const encodeS3KeyPath = (key: string) => `/${key.split('/').map((part) => encodeRfc3986(part)).join('/')}`

const hmac = (key: Buffer | string, data: string) => crypto.createHmac('sha256', key).update(data, 'utf8').digest()
const sha256Hex = (data: string) => crypto.createHash('sha256').update(data, 'utf8').digest('hex')

const getSignatureKey = (secretAccessKey: string, dateStamp: string, region = 'auto', service = 's3') => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, 'aws4_request')
}

const buildCanonicalQuery = (params: Record<string, string>) => {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(params[k])}`)
    .join('&')
}

export const createR2PresignedUrl = ({
  method,
  bucket,
  accountId,
  key,
  accessKeyId,
  secretAccessKey,
  expiresInSeconds = 900,
  contentType
}: PresignParams) => {
  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`
  const canonicalUri = encodeS3KeyPath(key)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const signedHeaders = contentType ? 'content-type;host' : 'host'

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(60, Math.min(604800, expiresInSeconds))),
    'X-Amz-SignedHeaders': signedHeaders
  }

  const canonicalQueryString = buildCanonicalQuery(query)
  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n')

  const signingKey = getSignatureKey(secretAccessKey, dateStamp)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
  const finalQuery = `${canonicalQueryString}&X-Amz-Signature=${signature}`
  const url = `https://${host}${canonicalUri}?${finalQuery}`

  return { url, key, host, expiresInSeconds }
}
