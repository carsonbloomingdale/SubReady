import { useRef, useState } from 'react'

export interface TriageResult {
  status: 'green' | 'amber' | 'red'
  reason: string
  nextStep: string
  mistakes?: string[]
  detectedTypes?: string[]
  parseWarnings?: string[]
}

interface FileUploadProps {
  onUploadComplete: (result: TriageResult) => void
  onUploadStart?: () => void
  onError?: (message: string) => void
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md'

export default function FileUpload({
  onUploadComplete,
  onUploadStart,
  onError,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setUploading(true)
    onUploadStart?.()

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : 'Upload failed'
        throw new Error(detail)
      }

      onUploadComplete(data as TriageResult)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      onError?.(message)
    } finally {
      setUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full px-6 py-3 bg-[#1D9E75] text-white rounded-lg font-semibold hover:bg-[#1a8563] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? 'Processing document…' : 'Upload PDF or image'}
      </button>
      {fileName && (
        <p className="text-gray-400 text-sm text-center truncate max-w-full">
          {uploading ? `Sending ${fileName}…` : fileName}
        </p>
      )}
      <p className="text-gray-500 text-xs text-center">
        PDF, PNG, JPG, WEBP, GIF, or text files up to 10 MB
      </p>
    </div>
  )
}
