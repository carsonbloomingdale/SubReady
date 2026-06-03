import { useState, useCallback } from 'react'
import Logo from './Logo'
import UploadDropzone from './UploadDropzone'
import DocumentList from './DocumentList'
import {
  DOC_SLOTS,
  detectDocType,
  triageToDocStatus,
  type DocumentSlot,
  type DocType,
  type TriageResult,
} from './types'

async function triageDocument(ocrText: string): Promise<TriageResult> {
  const response = await fetch('/api/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ocrText }),
  })
  if (!response.ok) throw new Error('Triage failed')
  return response.json()
}

function App() {
  const [documents, setDocuments] = useState<DocumentSlot[]>(
    DOC_SLOTS.map((d) => ({ ...d })),
  )
  const [link, setLink] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const readyCount = documents.filter((d) => d.status === 'ready').length
  const allDone = documents.every((d) => d.status !== 'pending' && d.status !== 'reviewing')
  const canGenerateLink = allDone && readyCount > 0

  const updateDoc = useCallback((id: DocType, patch: Partial<DocumentSlot>) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }, [])

  const handleUpload = useCallback(
    async (file: File, ocrText: string) => {
      const detected = detectDocType(ocrText, file.name)
      const targetId =
        detected ??
        documents.find((d) => d.status === 'pending')?.id ??
        documents[0].id

      updateDoc(targetId, { status: 'reviewing', fileName: file.name })
      setProcessing(true)
      setLink(null)

      try {
        const triage = await triageDocument(ocrText)
        updateDoc(targetId, {
          status: triageToDocStatus(triage.status),
          triage,
        })
      } catch {
        updateDoc(targetId, {
          status: 'issue',
          triage: {
            status: 'red',
            reason: 'Could not reach review service.',
            nextStep: 'Check your connection and try again.',
          },
        })
      } finally {
        setProcessing(false)
      }
    },
    [documents, updateDoc],
  )

  const handleGetLink = () => {
    const id = crypto.randomUUID().slice(0, 8)
    setLink(`${window.location.origin}/share/${id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <Logo />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">SubReady</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Upload your compliance docs once. Share anywhere.
        </p>

        {/* Upload */}
        <UploadDropzone onUpload={handleUpload} disabled={processing} />

        {/* Document list */}
        <div className="mt-4">
          <DocumentList documents={documents} />
        </div>

        {/* CTA */}
        <button
          onClick={handleGetLink}
          disabled={!canGenerateLink}
          className={`
            w-full mt-4 py-3.5 rounded-xl text-sm font-semibold transition-colors
            ${
              canGenerateLink
                ? 'bg-[#1D9E75] text-white hover:bg-[#178a64] cursor-pointer'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          Get my readiness link
        </button>

        {link && (
          <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-100">
            <p className="text-xs text-green-700 font-medium mb-1">Your readiness link</p>
            <p className="text-xs text-green-800 break-all font-mono">{link}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-5">
        AI-assisted review · No account required to share
      </p>
    </div>
  )
}

export default App
