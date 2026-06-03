import { useRef, useState, useCallback } from 'react'
import { extractText, isAcceptedFile } from './ocr'

interface UploadDropzoneProps {
  onUpload: (file: File, ocrText: string) => void
  disabled?: boolean
}

const ACCEPTED = 'application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp,.gif'

export default function UploadDropzone({ onUpload, disabled }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(
    async (file: File) => {
      if (disabled || processing) return

      if (!isAcceptedFile(file)) {
        setError('Please upload a PDF or image file.')
        return
      }

      setError(null)
      setProcessing(true)
      try {
        const ocrText = await extractText(file)
        onUpload(file, ocrText)
      } catch (err) {
        console.error('OCR failed:', err)
        setError('Could not read that file. Try another PDF or image.')
      } finally {
        setProcessing(false)
      }
    },
    [disabled, processing, onUpload],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = ''
    },
    [processFile],
  )

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && !processing && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled && !processing) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center
          rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer
          transition-colors
          ${dragging ? 'border-[#1D9E75] bg-[#f0faf6]' : 'border-gray-200 bg-[#f9fafb]'}
          ${disabled || processing ? 'opacity-60 cursor-not-allowed' : 'hover:border-[#1D9E75] hover:bg-[#f0faf6]'}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleChange}
          disabled={disabled || processing}
        />

        {processing ? (
          <>
            <div className="w-8 h-8 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-gray-800">Reading document…</p>
            <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
          </>
        ) : (
          <>
            <svg className="w-8 h-8 text-[#1D9E75] mb-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
            </svg>
            <p className="text-sm font-semibold text-gray-800 text-center">
              Drop your COI or W-9 here
            </p>
            <p className="text-xs text-gray-400 mt-1">PDF or image · tap to browse</p>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
    </div>
  )
}
