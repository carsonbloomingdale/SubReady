import { createWorker, type Worker } from 'tesseract.js'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const TESSERACT_OPTS = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4',
}

const MAX_IMAGE_EDGE = 2000
const MIN_OCR_CHARS = 15

let ocrWorkerPromise: Promise<Worker> | null = null

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const worker = await createWorker(TESSERACT_OPTS)
      await worker.loadLanguage('eng')
      await worker.initialize('eng')
      return worker
    })()
  }
  return ocrWorkerPromise
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

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

async function runTesseract(imageDataUrl: string): Promise<string> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(imageDataUrl)
  return data.text ?? ''
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

/** Demo route only — pre-written OCR samples from the server. */
export async function fetchDemoOcr(sampleId: string): Promise<string> {
  const res = await fetch(`/api/context/ocr/${sampleId}`)
  if (!res.ok) throw new Error('Demo sample not available')
  const data = (await res.json()) as { ocrText: string }
  return data.ocrText
}

function normalizeOcrText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    let text = ''
    try {
      text = normalizeOcrText(await extractPdfText(file))
    } catch (err) {
      console.warn('PDF text extraction failed:', err)
    }
    if (text.length >= MIN_OCR_CHARS) {
      return text
    }
    throw new Error(
      'This PDF has no readable text layer. Try a photo or scan of the document instead.',
    )
  }

  if (!isImageFile(file)) {
    throw new Error('Unsupported file type.')
  }

  const preprocessed = await preprocessImageForOcr(file)
  const text = normalizeOcrText(await runTesseract(preprocessed))

  if (text.length === 0) {
    throw new Error(
      'No text found in this image. Retake with even lighting, fill the frame, and avoid glare.',
    )
  }

  return text
}
