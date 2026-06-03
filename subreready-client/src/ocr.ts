import { recognize } from 'tesseract.js'

const TESSERACT_OPTS = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4',
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function isAcceptedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (
    file.type === 'application/pdf' ||
    file.type.startsWith('image/') ||
    ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
  )
}

export async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return `[PDF document: ${file.name}]`
  }

  const dataUrl = await fileToDataUrl(file)
  const { data } = await recognize(dataUrl, 'eng', TESSERACT_OPTS)
  return data.text
}
