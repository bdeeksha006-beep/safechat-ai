import jsQR from 'jsqr'
import { analyzeUrl } from './rules'

// Client-side media analysis: QR extraction + file validation.
// Never executes or opens untrusted content.

const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/(pdf|zip|msword|vnd\.openxmlformats-officedocument\.\w+\.sheet\w*|vnd\.openxmlformats-officedocument\.\w+\.document\w*)|text\/plain)$/
const BLOCKED_EXT = /\.(exe|msi|bat|cmd|ps1|scr|com|pif|vbs|js|jar|apk|app|deb|rpm|sh|dll|sys)$/i
const MAX_SIZE = 15 * 1024 * 1024 // 15 MB

export function validateFile(file) {
  const issues = []
  if (!file) return { ok: false, issues: ['No file'] }
  if (file.size > MAX_SIZE) issues.push('File exceeds 15 MB limit')
  if (BLOCKED_EXT.test(file.name)) issues.push('Executable file type not allowed')
  if (file.type && !ALLOWED_MIME.test(file.type)) issues.push(`MIME type not allowed: ${file.type}`)
  return { ok: issues.length === 0, issues }
}

// Decode QR codes from an image File. Returns [{data, analysis}].
export async function analyzeImageForQR(file) {
  const results = []
  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(img.data, img.width, img.height)
    if (code?.data) {
      const looksLikeUrl = /^https?:\/\//i.test(code.data) || /\./.test(code.data)
      const analysis = looksLikeUrl ? analyzeUrl(code.data) : { url: code.data, flags: ['QR contains non-URL data'], weight: 15 }
      results.push({ type: 'qr', data: code.data, analysis })
    }
  } catch {
    // not an image / decode failed — not fatal
  }
  return results
}
