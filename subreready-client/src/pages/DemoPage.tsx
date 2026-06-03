import { useState, useCallback } from 'react'
import UploadDropzone from '../UploadDropzone'
import DocumentList from '../DocumentList'
import ReadinessPanel from '../ReadinessPanel'
import PageShell, { FooterLink } from '../PageShell'
import { fetchDemoOcr } from '../ocr'
import { appendAuditEvent, DEMO_PROJECT } from '../api'
import { useMobilizationFlow } from '../hooks/useMobilizationFlow'
import type { DocType } from '../types'

export default function DemoPage() {
  const flow = useMobilizationFlow({ demo: true, audit: true })
  const [link, setLink] = useState<string | null>(null)

  const loadDemoSample = useCallback(
    async (sampleId: string, docId: DocType, label: string) => {
      setLink(null)
      try {
        const ocrText = await fetchDemoOcr(sampleId)
        await flow.applyTriageResult(docId, label, ocrText)
      } catch (err) {
        await flow.applyTriageResult(
          docId,
          label,
          `[demo load failed: ${err instanceof Error ? err.message : 'unknown'}]`,
        )
      }
    },
    [flow],
  )

  const handleGetLink = async () => {
    const id = crypto.randomUUID().slice(0, 8)
    setLink(`${window.location.origin}/share/${id}`)
    try {
      const chain = await appendAuditEvent(
        flow.auditRef.current,
        'mobilization_link_created',
        'project/demo',
        `score=${flow.readiness?.overallScore ?? 0}`,
      )
      flow.setAuditChain(chain)
      flow.auditRef.current = chain
    } catch {
      /* non-blocking */
    }
  }

  const handleUpload = useCallback(
    async (file: File, ocrText: string) => {
      setLink(null)
      await flow.handleUpload(file, ocrText)
    },
    [flow],
  )

  return (
    <PageShell
      footer={
        <>
          <p className="text-xs text-gray-400 mt-5 text-center">
            Rules-first triage · Readiness updates after each upload
          </p>
          <FooterLink to="/">← Back to upload</FooterLink>
        </>
      }
    >
      <p className="text-sm text-gray-500 mb-1">
        {DEMO_PROJECT.name} · {DEMO_PROJECT.gcLegalName}
      </p>
      <p className="text-xs text-gray-400 mb-4">Residential · private · mobilization triage</p>

      {flow.bootError && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
          {flow.bootError}
        </div>
      )}

      <UploadDropzone onUpload={handleUpload} disabled={flow.processing} />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={flow.processing}
          onClick={() => loadDemoSample('coi_north_river', 'coi', 'COI North River (active)')}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75] disabled:opacity-50"
        >
          Demo COI ✓
        </button>
        <button
          type="button"
          disabled={flow.processing}
          onClick={() => loadDemoSample('coi_hudson', 'coi', 'COI Hudson (expired)')}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75] disabled:opacity-50"
        >
          Demo COI expired
        </button>
        <button
          type="button"
          disabled={flow.processing}
          onClick={() => loadDemoSample('w9_north_river', 'w9', 'W-9 North River')}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75] disabled:opacity-50"
        >
          Demo W-9
        </button>
      </div>

      <div className="mt-4">
        <DocumentList documents={flow.documents} />
      </div>

      <ReadinessPanel
        readiness={flow.readiness}
        loading={flow.readinessLoading}
        error={flow.readinessError}
        requirements={flow.mergeRequirementsForDisplay()}
        showFullChecklist
      />

      <button
        onClick={handleGetLink}
        disabled={!flow.canGenerateLink || flow.processing}
        className={`
          w-full mt-4 py-3.5 rounded-xl text-sm font-semibold transition-colors
          ${
            flow.canGenerateLink
              ? 'bg-[#1D9E75] text-white hover:bg-[#178a64] cursor-pointer'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }
        `}
      >
        {flow.canGenerateLink
          ? 'Get my readiness link'
          : 'Upload COI and W-9 to continue'}
      </button>

      {link && (
        <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-100">
          <p className="text-xs text-green-700 font-medium mb-1">Your readiness link</p>
          <p className="text-xs text-green-800 break-all font-mono">{link}</p>
          {flow.readiness && (
            <p className="text-xs text-green-700 mt-1">
              Score {flow.readiness.overallScore} · {flow.readiness.classification.label}
            </p>
          )}
        </div>
      )}
    </PageShell>
  )
}
