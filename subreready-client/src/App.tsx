import { useState } from 'react'
import ScanButton from './ScanButton'
import ResultCard from './ResultCard'

interface TriageResult {
  status: 'green' | 'amber' | 'red'
  reason: string
  nextStep: string
}

function App() {
  const [state, setState] = useState<'idle' | 'scanning' | 'result'>('idle')
  const [result, setResult] = useState<TriageResult | null>(null)

  const handleScanComplete = async (ocrText: string) => {
    setState('scanning')
    try {
      const response = await fetch('http://localhost:3000/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText })
      })
      const data = await response.json()
      setResult(data as TriageResult)
      setState('result')
    } catch (error) {
      console.error('Triage request failed:', error)
      setState('idle')
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-[#1D9E75] mb-8">SubReady</h1>
      
      {state === 'idle' || state === 'scanning' ? (
        <ScanButton onScanComplete={handleScanComplete} />
      ) : (
        <ResultCard result={result} />
      )}
    </div>
  )
}

export default App

