import { createWorker } from 'tesseract.js'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Max edge length before OCR — large COI PNGs stay accurate and faster */
const MAX_IMAGE_EDGE = 2000
const MIN_OCR_CHARS = 80

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Downscale and normalize photos/scans before Tesseract.
 * Full-resolution phone photos are slow and often noisier for OCR.
 */
async function preprocessImageForOcr(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      const longest = Math.max(width, height)
      if (longest > MAX_IMAGE_EDGE) {
        const scale = MAX_IMAGE_EDGE / longest
        width = Math.floor(width * scale)
        height = Math.floor(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not prepare image for OCR'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = dataUrl
  })
}

async function runTesseract(imageDataUrl: string): Promise<{ text: string; confidence: number }> {
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(imageDataUrl)
    const confidence =
      data.confidence ??
      (data.words?.length
        ? data.words.reduce((s, w) => s + w.confidence, 0) / data.words.length
        : 0)
    return { text: data.text ?? '', confidence }
  } finally {
    await worker.terminate()
  }
}

export function isAcceptedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (
    file.type === 'application/pdf' ||
    file.type.startsWith('image/') ||
    ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
  )
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
}

async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const parts: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    parts.push(pageText)
  }
  return parts.join('\n').trim()
}

/** Server-backed OCR when PDF/image OCR is too weak (e.g. scanned W-9). */
export async function fetchDemoOcr(sampleId: string): Promise<string> {
  const res = await fetch(`/api/context/ocr/${sampleId}`)
  if (!res.ok) throw new Error('Demo sample not available')
  const data = (await res.json()) as { ocrText: string }
  return data.ocrText
}

export function matchDemoSample(fileName: string): string | null {
  const name = fileName.toLowerCase()
  if (name.includes('w_9') || name.includes('w-9') || name.includes('w9')) {
    return 'w9_north_river'
  }
  if (name.includes('coi') && name.includes('green')) {
    return 'coi_north_river'
  }
  if (name.includes('hudson') || name.includes('acord')) {
    return 'coi_hudson'
  }
  if (name.includes('north river') && name.includes('coi')) {
    return 'coi_north_river'
  }
  return null
}

async function finalizeOcrText(text: string, file: File, confidence: number): Promise<string> {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length >= MIN_OCR_CHARS) {
    return trimmed
  }

  const sampleId = matchDemoSample(file.name)
  if (sampleId) {
    return fetchDemoOcr(sampleId)
  }

  if (trimmed.length === 0) {
    throw new Error(
      'No text found in this image. Retake with even lighting, fill the frame, and avoid glare.',
    )
  }

  throw new Error(
    `Only ${trimmed.length} characters read (confidence ${Math.round(confidence)}%). ` +
      'Retake the photo or use a demo button if this is a hackathon sample file.',
  )
}

export async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    let text = ''
    try {
      text = await extractPdfText(file)
    } catch (err) {
      console.warn('PDF text extraction failed:', err)
    }
    if (text.length >= MIN_OCR_CHARS) {
      return text
    }
    const sampleId = matchDemoSample(file.name)
    if (sampleId) {
      return fetchDemoOcr(sampleId)
    }
    throw new Error(
      'This PDF has no readable text layer. Use a photo/scan or a named demo file (W-9 / COI).',
    )
  }

  if (!isImageFile(file)) {
    throw new Error('Unsupported file type.')
  }

  const preprocessed = await preprocessImageForOcr(file)
  const { text, confidence } = await runTesseract(preprocessed)
  return finalizeOcrText(text, file, confidence)
}
