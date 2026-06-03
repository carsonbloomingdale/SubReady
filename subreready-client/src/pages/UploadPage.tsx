import { useState } from 'react'
import UploadDropzone from '../UploadDropzone'
import DocumentList from '../DocumentList'
import ReadinessPanel from '../ReadinessPanel'
import ProjectSetupForm from '../ProjectSetupForm'
import RequirementsChecklist from '../RequirementsChecklist'
import PageShell, { FooterLink } from '../PageShell'
import { appendAuditEvent } from '../api'
import { useMobilizationFlow } from '../hooks/useMobilizationFlow'

export default function UploadPage() {
  const flow = useMobilizationFlow({ adaptive: true, audit: true })
  const [link, setLink] = useState<string | null>(null)

  const handleGetLink = async () => {
    const id = crypto.randomUUID().slice(0, 8)
    setLink(`${window.location.origin}/share/${id}`)
    try {
      const chain = await appendAuditEvent(
        flow.auditRef.current,
        'mobilization_link_created',
        `project/${flow.project.name}`,
        `score=${flow.readiness?.overallScore ?? 0}`,
      )
      flow.setAuditChain(chain)
      flow.auditRef.current = chain
    } catch {
      /* non-blocking */
    }
  }

  if (flow.phase === 'setup') {
    return (
      <PageShell
        footer={
          <p className="text-xs text-gray-400 mt-5 text-center">
            Adaptive requirements · configured before upload
          </p>
        }
      >
        <p className="text-sm text-gray-500 mb-4">
          Tell us about the job first. SubReady builds a mobilization checklist for that
          project before you scan documents.
        </p>
        <ProjectSetupForm
          value={flow.project}
          onChange={flow.setProject}
          onSubmit={flow.handleProjectSubmit}
          loading={flow.setupLoading}
          error={flow.setupError}
        />
        <FooterLink to="/demo">Skip to GC demo with sample docs →</FooterLink>
      </PageShell>
    )
  }

  if (flow.setupLoading && flow.documents.length === 0) {
    return (
      <PageShell>
        <div className="py-12 text-center">
          <div className="w-8 h-8 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading project requirements…</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      footer={
        <>
          <p className="text-xs text-gray-400 mt-5 text-center">
            Rules-first triage · Readiness updates after each capture
          </p>
          <FooterLink to="/demo">GC demo with sample docs →</FooterLink>
        </>
      }
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-gray-800">{flow.project.name}</p>
        <button
          type="button"
          onClick={flow.resetProject}
          className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
        >
          Edit project
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-1">{flow.project.gcLegalName}</p>
      <p className="text-xs text-gray-400 mb-4 capitalize">{flow.projectSummary}</p>

      <RequirementsChecklist
        requirements={flow.requirements}
        emphasis={flow.emphasis}
        scoringProfile={flow.scoringProfile}
      />

      <p className="text-xs font-semibold text-gray-700 mt-4 mb-2">Capture documents</p>

      <UploadDropzone onUpload={flow.handleUpload} disabled={flow.processing} />

      <div className="mt-4">
        <DocumentList documents={flow.documents} />
      </div>

      <ReadinessPanel
        readiness={flow.hasUploads ? flow.readiness : null}
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
          : 'Complete scannable docs to continue'}
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
