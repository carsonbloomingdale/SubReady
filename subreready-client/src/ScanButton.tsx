import { useState, useRef, useEffect } from 'react'

interface ScanButtonProps {
  onScanComplete: (ocrText: string) => void
}

export default function ScanButton({ onScanComplete }: ScanButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startCamera = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      setError('Failed to access camera: ' + (err as Error).message)
    }
  }

  const captureAndScan = async () => {
    if (!videoRef.current || !canvasRef.current) return

    // Capture frame
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx?.drawImage(video, 0, 0)

    const imageData = canvas.toDataURL('image/png')

    try {
      const { data: { text } } = await Tesseract.recognize(
        imageData,
        'eng',
        { logger: (p) => console.log('OCR:', p.status) }
      )
      onScanComplete(text)
    } catch (err) {
      setError('OCR failed: ' + (err as Error).message)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f1117]">
      {error && <p className="text-red-400 mb-4">{error}</p>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-w-md rounded-lg bg-black mb-4"
      />
      <canvas ref={canvasRef} className="hidden" />
      <button
        onClick={startCamera}
        className="mt-4 px-6 py-3 bg-[#1D9E75] text-white rounded-lg font-semibold hover:bg-[#1a8563] transition"
      >
        Start Camera
      </button>
      <button
        onClick={captureAndScan}
        disabled={!streamRef.current}
        className="mt-4 px-6 py-3 bg-[#1D9E75] text-white rounded-lg font-semibold hover:bg-[#1a8563] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Scan Document
      </button>
    </div>
  )
}

