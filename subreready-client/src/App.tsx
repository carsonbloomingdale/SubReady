import { useState } from 'react'
import ScanButton from './ScanButton'
import ResultCard from './ResultCard'
import FileUpload, { type TriageResult } from './FileUpload'

function App() {
  const [state, setState] = useState<'idle' | 'scanning' | 'result'>('idle')
  const [result, setResult] = useState<TriageResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleTriageResult = (data: TriageResult) => {
    setResult(data)
    setState('result')
    setError(null)
  }

  const handleScanComplete = async (ocrText: string) => {
    setState('scanning')
    setError(null)
    try {
      const response = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail ?? 'Triage request failed')
      }
      handleTriageResult(data as TriageResult)
    } catch (err) {
      console.error('Triage request failed:', err)
      setError(err instanceof Error ? err.message : 'Triage failed')
      setState('idle')
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-[#1D9E75] mb-8">SubReady</h1>

      {error && (
        <p className="text-red-400 text-sm mb-4 max-w-md text-center">{error}</p>
      )}

      {state === 'result' && result ? (
        <ResultCard
          status={result.status}
          reason={result.reason}
          nextStep={result.nextStep}
          mistakes={result.mistakes}
          parseWarnings={result.parseWarnings}
          onReset={() => {
            setState('idle')
            setResult(null)
            setError(null)
          }}
        />
      ) : (
        <div className="flex flex-col items-center gap-8 w-full max-w-md">
          <FileUpload
            onUploadStart={() => {
              setState('scanning')
              setError(null)
            }}
            onUploadComplete={handleTriageResult}
            onError={(message) => {
              setError(message)
              setState('idle')
            }}
          />
          <div className="w-full border-t border-gray-700 pt-8 flex flex-col items-center">
            <p className="text-gray-500 text-sm mb-4">Or scan with camera</p>
            <ScanButton onScanComplete={handleScanComplete} />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
