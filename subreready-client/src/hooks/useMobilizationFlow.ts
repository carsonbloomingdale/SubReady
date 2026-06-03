import { useState, useCallback, useEffect, useRef } from 'react'
import {
  appendAuditEvent,
  evaluateReadiness,
  generateRequirements,
  mergeRequirementsForDisplay,
  triageDocument,
  uploadSlotRequirements,
  DEMO_PROJECT,
  UPLOAD_PROJECT,
  type AuditEvent,
  type DemoProject,
  type ReadinessResult,
  type RequirementRow,
} from '../api'
import {
  DOC_SLOTS,
  detectDocType,
  triageToDocStatus,
  type DocumentSlot,
  type DocType,
} from '../types'

interface Options {
  /** Demo route: Maple Street project, full checklist, sample OCR buttons. */
  demo?: boolean
  /** Record audit events after triage (demo GC workflow). */
  audit?: boolean
}

export function useMobilizationFlow({ demo = false, audit = false }: Options = {}) {
  const project: DemoProject | undefined = demo ? DEMO_PROJECT : undefined
  const evaluateProject = demo ? DEMO_PROJECT : UPLOAD_PROJECT

  const [documents, setDocuments] = useState<DocumentSlot[]>(
    DOC_SLOTS.map((d) => ({ ...d })),
  )
  const [requirements, setRequirements] = useState<RequirementRow[]>(
    demo ? [] : uploadSlotRequirements(),
  )
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [auditChain, setAuditChain] = useState<AuditEvent[]>([])
  const [processing, setProcessing] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  const documentsRef = useRef(documents)
  const requirementsRef = useRef(requirements)
  const auditRef = useRef(auditChain)
  documentsRef.current = documents
  requirementsRef.current = requirements
  auditRef.current = auditChain

  const refreshReadiness = useCallback(
    async (docs: DocumentSlot[], reqs: RequirementRow[]) => {
      if (reqs.length === 0) return
      const hasUpload = docs.some((d) => d.status !== 'pending' && d.status !== 'reviewing')
      if (!demo && !hasUpload) {
        setReadiness(null)
        return
      }
      setReadinessLoading(true)
      setReadinessError(null)
      try {
        const result = await evaluateReadiness(reqs, docs, auditRef.current, evaluateProject)
        setReadiness(result)
      } catch (err) {
        setReadinessError(err instanceof Error ? err.message : 'Readiness check failed')
      } finally {
        setReadinessLoading(false)
      }
    },
    [demo, evaluateProject],
  )

  useEffect(() => {
    if (!demo) return

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
  }, [demo, refreshReadiness])

  const updateDoc = useCallback((id: DocType, patch: Partial<DocumentSlot>) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }, [])

  const commitDocsAndRefresh = useCallback(
    async (
      nextDocs: DocumentSlot[],
      auditNote?: { docId: DocType; fileName: string; status: string },
    ) => {
      setDocuments(nextDocs)
      documentsRef.current = nextDocs

      if (audit && auditNote) {
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
    [audit, refreshReadiness],
  )

  const handleUpload = useCallback(
    async (file: File, ocrText: string) => {
      const detected = detectDocType(ocrText, file.name)
      const targetId =
        detected ??
        documentsRef.current.find((d) => d.status === 'pending')?.id ??
        documentsRef.current[0].id

      updateDoc(targetId, { status: 'reviewing', fileName: file.name })
      setProcessing(true)

      try {
        const triage = await triageDocument(ocrText, targetId, project)
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
    [updateDoc, commitDocsAndRefresh, project],
  )

  const applyTriageResult = useCallback(
    async (docId: DocType, fileName: string, ocrText: string) => {
      updateDoc(docId, { status: 'reviewing', fileName })
      setProcessing(true)
      try {
        const triage = await triageDocument(ocrText, docId, project ?? DEMO_PROJECT)
        const nextDocs = documentsRef.current.map((d) =>
          d.id === docId
            ? {
                ...d,
                status: triageToDocStatus(triage.status),
                triage,
                fileName,
              }
            : d,
        )
        await commitDocsAndRefresh(nextDocs, {
          docId,
          fileName,
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
                  reason: err instanceof Error ? err.message : 'Triage failed',
                  nextStep: 'Check API server and re-scan.',
                },
                fileName,
              }
            : d,
        )
        await commitDocsAndRefresh(nextDocs)
      } finally {
        setProcessing(false)
      }
    },
    [updateDoc, commitDocsAndRefresh, project],
  )

  const allDone = documents.every((d) => d.status !== 'pending' && d.status !== 'reviewing')
  const canGenerateLink =
    allDone &&
    (readiness?.mobilizationReady || (readiness != null && readiness.overallScore >= 75))

  const displayRequirements = demo
    ? mergeRequirementsForDisplay(requirements, documents)
    : mergeRequirementsForDisplay(requirements, documents).filter((r) =>
        (['coi', 'w9'] as string[]).includes(r.docType),
      )

  return {
    documents,
    requirements,
    readiness,
    readinessLoading,
    readinessError,
    processing,
    bootError,
    auditChain,
    auditRef,
    setAuditChain,
    handleUpload,
    applyTriageResult,
    mergeRequirementsForDisplay: () => displayRequirements,
    canGenerateLink,
    allDone,
    hasUploads: documents.some((d) => d.status !== 'pending' && d.status !== 'reviewing'),
  }
}
