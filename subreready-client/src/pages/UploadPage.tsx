import { useState } from 'react'
import UploadDropzone from '../UploadDropzone'
import DocumentList from '../DocumentList'
import ReadinessPanel from '../ReadinessPanel'
import PageShell, { FooterLink } from '../PageShell'
import { appendAuditEvent } from '../api'
import { useMobilizationFlow } from '../hooks/useMobilizationFlow'

export default function UploadPage() {
  const flow = useMobilizationFlow()
  const [link, setLink] = useState<string | null>(null)

  const handleGetLink = async () => {
    const id = crypto.randomUUID().slice(0, 8)
    setLink(`${window.location.origin}/share/${id}`)
    try {
      const chain = await appendAuditEvent(
        flow.auditRef.current,
        'mobilization_link_created',
        'project/upload',
        `score=${flow.readiness?.overallScore ?? 0}`,
      )
      flow.setAuditChain(chain)
      flow.auditRef.current = chain
    } catch {
      /* non-blocking */
    }
  }

  return (
    <PageShell
      footer={
        <>
          <p className="text-xs text-gray-400 mt-5 text-center">
            Rules-first triage · Readiness updates after each upload
          </p>
          <FooterLink to="/demo">GC demo with sample docs →</FooterLink>
        </>
      }
    >
      <p className="text-sm text-gray-500 mb-6">
        Upload your compliance docs once. Share anywhere.
      </p>

      {flow.bootError && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
          {flow.bootError}
        </div>
      )}

      <UploadDropzone onUpload={flow.handleUpload} disabled={flow.processing} />

      <div className="mt-4">
        <DocumentList documents={flow.documents} />
      </div>

      <ReadinessPanel
        readiness={flow.hasUploads ? flow.readiness : null}
        loading={flow.readinessLoading}
        error={flow.readinessError}
        requirements={flow.mergeRequirementsForDisplay()}
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
