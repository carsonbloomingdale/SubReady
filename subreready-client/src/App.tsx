import { useState, useCallback, useEffect, useRef } from 'react'
import Logo from './Logo'
import UploadDropzone from './UploadDropzone'
import DocumentList from './DocumentList'
import ReadinessPanel from './ReadinessPanel'
import { fetchDemoOcr } from './ocr'
import {
  appendAuditEvent,
  evaluateReadiness,
  generateRequirements,
  mergeRequirementsForDisplay,
  triageDocument,
  type AuditEvent,
  type DemoProject,
  type ReadinessResult,
  type RequirementRow,
  DEMO_PROJECT,
} from './api'
import {
  DOC_SLOTS,
  detectDocType,
  triageToDocStatus,
  type DocumentSlot,
  type DocType,
} from './types'

function App() {
  const [documents, setDocuments] = useState<DocumentSlot[]>(
    DOC_SLOTS.map((d) => ({ ...d })),
  )
  const [requirements, setRequirements] = useState<RequirementRow[]>([])
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [auditChain, setAuditChain] = useState<AuditEvent[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  const documentsRef = useRef(documents)
  const requirementsRef = useRef(requirements)
  const auditRef = useRef(auditChain)
  documentsRef.current = documents
  requirementsRef.current = requirements
  auditRef.current = auditChain

  const refreshReadiness = useCallback(async (docs: DocumentSlot[], reqs: RequirementRow[]) => {
    if (reqs.length === 0) return
    setReadinessLoading(true)
    setReadinessError(null)
    try {
      const result = await evaluateReadiness(reqs, docs, auditRef.current)
      setReadiness(result)
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'Readiness check failed')
    } finally {
      setReadinessLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const reqs = await generateRequirements(DEMO_PROJECT)
        if (cancelled) return
        setRequirements(reqs)
        await refreshReadiness(documentsRef.current, reqs)
      } catch (err) {
        if (!cancelled) {
          setBootError(
            err instanceof Error ? err.message : 'Could not reach API — start server on :8000',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshReadiness])

  const readyCount = documents.filter((d) => d.status === 'ready').length
  const allDone = documents.every((d) => d.status !== 'pending' && d.status !== 'reviewing')
  const canGenerateLink =
    allDone &&
    (readiness?.mobilizationReady ||
      (readiness != null && readiness.overallScore >= 75))

  const updateDoc = useCallback((id: DocType, patch: Partial<DocumentSlot>) => {
    setDocuments((prev) => {
      const next = prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
      return next
    })
  }, [])

  const commitDocsAndRefresh = useCallback(
    async (nextDocs: DocumentSlot[], auditNote?: { docId: DocType; fileName: string; status: string }) => {
      setDocuments(nextDocs)
      documentsRef.current = nextDocs
      if (auditNote) {
        try {
          const chain = await appendAuditEvent(
            auditRef.current,
            'document_triaged',
            `project/demo/sub/${auditNote.docId}`,
            `${auditNote.fileName}: ${auditNote.status}`,
          )
          setAuditChain(chain)
          auditRef.current = chain
        } catch {
          /* audit optional */
        }
      }
      await refreshReadiness(nextDocs, requirementsRef.current)
    },
    [refreshReadiness],
  )

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
        const triage = await triageDocument(ocrText, targetId, DEMO_PROJECT)
        const nextDocs = documentsRef.current.map((d) =>
          d.id === targetId
            ? {
                ...d,
                status: triageToDocStatus(triage.status),
                triage,
                fileName: file.name,
              }
            : d,
        )
        await commitDocsAndRefresh(nextDocs, {
          docId: targetId,
          fileName: file.name,
          status: triage.status,
        })
      } catch (err) {
        const nextDocs = documentsRef.current.map((d) =>
          d.id === targetId
            ? {
                ...d,
                status: 'issue' as const,
                triage: {
                  status: 'red' as const,
                  reason: err instanceof Error ? err.message : 'Triage failed',
                  nextStep: 'Check API server and re-scan.',
                },
                fileName: file.name,
              }
            : d,
        )
        await commitDocsAndRefresh(nextDocs)
      } finally {
        setProcessing(false)
      }
    },
    [documents, updateDoc, commitDocsAndRefresh],
  )

  const handleGetLink = async () => {
    const id = crypto.randomUUID().slice(0, 8)
    setLink(`${window.location.origin}/share/${id}`)
    try {
      const chain = await appendAuditEvent(
        auditRef.current,
        'mobilization_link_created',
        'project/demo',
        `score=${readiness?.overallScore ?? 0}`,
      )
      setAuditChain(chain)
      auditRef.current = chain
    } catch {
      /* non-blocking */
    }
  }

  const loadDemoSample = useCallback(
    async (sampleId: string, docId: DocType, label: string) => {
      setProcessing(true)
      setLink(null)
      updateDoc(docId, { status: 'reviewing', fileName: label })
      try {
        const ocrText = await fetchDemoOcr(sampleId)
        const triage = await triageDocument(ocrText, docId, DEMO_PROJECT)
        const nextDocs = documentsRef.current.map((d) =>
          d.id === docId
            ? {
                ...d,
                status: triageToDocStatus(triage.status),
                triage,
                fileName: label,
              }
            : d,
        )
        await commitDocsAndRefresh(nextDocs, {
          docId,
          fileName: label,
          status: triage.status,
        })
      } catch (err) {
        const nextDocs = documentsRef.current.map((d) =>
          d.id === docId
            ? {
                ...d,
                status: 'issue' as const,
                triage: {
                  status: 'red' as const,
                  reason: err instanceof Error ? err.message : 'Demo failed',
                  nextStep: 'Start the API server on port 8000.',
                },
                fileName: label,
              }
            : d,
        )
        await commitDocsAndRefresh(nextDocs)
      } finally {
        setProcessing(false)
      }
    },
    [updateDoc, commitDocsAndRefresh],
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-1">
          <Logo />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">SubReady</h1>
        </div>
        <p className="text-sm text-gray-500 mb-1">
          {DEMO_PROJECT.name} · {DEMO_PROJECT.gcLegalName}
        </p>
        <p className="text-xs text-gray-400 mb-4">Residential · private · mobilization triage</p>

        {bootError && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
            {bootError}
          </div>
        )}

        <UploadDropzone onUpload={handleUpload} disabled={processing} />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={processing}
            onClick={() => loadDemoSample('coi_north_river', 'coi', 'COI North River (active)')}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75] disabled:opacity-50"
          >
            Demo COI ✓
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={() => loadDemoSample('coi_hudson', 'coi', 'COI Hudson (expired)')}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75] disabled:opacity-50"
          >
            Demo COI expired
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={() => loadDemoSample('w9_north_river', 'w9', 'W-9 North River')}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75] disabled:opacity-50"
          >
            Demo W-9
          </button>
        </div>

        <div className="mt-4">
          <DocumentList documents={documents} />
        </div>

        <ReadinessPanel
          readiness={readiness}
          loading={readinessLoading}
          error={readinessError}
          requirements={mergeRequirementsForDisplay(requirements, documents)}
        />

        <button
          onClick={handleGetLink}
          disabled={!canGenerateLink || processing}
          className={`
            w-full mt-4 py-3.5 rounded-xl text-sm font-semibold transition-colors
            ${
              canGenerateLink
                ? 'bg-[#1D9E75] text-white hover:bg-[#178a64] cursor-pointer'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {canGenerateLink
            ? 'Get my readiness link'
            : 'Upload COI and W-9 to continue'}
        </button>

        {link && (
          <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-100">
            <p className="text-xs text-green-700 font-medium mb-1">Your readiness link</p>
            <p className="text-xs text-green-800 break-all font-mono">{link}</p>
            {readiness && (
              <p className="text-xs text-green-700 mt-1">
                Score {readiness.overallScore} · {readiness.classification.label}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-5">
        Rules-first triage · Readiness updates after each upload
      </p>
    </div>
  )
}

export default App
