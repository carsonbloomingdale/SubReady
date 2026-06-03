import { useState, useCallback, useEffect, useRef } from 'react'
import {
  appendAuditEvent,
  clearStoredProject,
  DEFAULT_PROJECT,
  DEMO_PROJECT,
  evaluateReadiness,
  generateRequirements,
  loadStoredProject,
  mergeRequirementsForDisplay,
  saveStoredProject,
  triageDocument,
  type AuditEvent,
  type ProjectConfig,
  type ReadinessResult,
  type RequirementRow,
} from '../api'
import {
  detectDocType,
  documentSlotsFromRequirements,
  triageToDocStatus,
  type DocumentSlot,
  type DocType,
} from '../types'

type Phase = 'setup' | 'onboarding'

interface Options {
  /** /demo — fixed Maple Street project + sample OCR buttons */
  demo?: boolean
  /** Record audit events after triage */
  audit?: boolean
  /** / — adaptive project wizard before uploads */
  adaptive?: boolean
}

export function useMobilizationFlow({ demo = false, audit = false, adaptive = false }: Options = {}) {
  const [phase, setPhase] = useState<Phase>(() =>
    adaptive && !demo ? (loadStoredProject() ? 'onboarding' : 'setup') : 'onboarding',
  )
  const [project, setProject] = useState<ProjectConfig>(() =>
    adaptive && !demo ? (loadStoredProject() ?? { ...DEFAULT_PROJECT }) : DEMO_PROJECT,
  )
  const [emphasis, setEmphasis] = useState('')
  const [scoringProfile, setScoringProfile] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  const [documents, setDocuments] = useState<DocumentSlot[]>([])
  const [requirements, setRequirements] = useState<RequirementRow[]>([])
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [auditChain, setAuditChain] = useState<AuditEvent[]>([])
  const [processing, setProcessing] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  const documentsRef = useRef(documents)
  const requirementsRef = useRef(requirements)
  const auditRef = useRef(auditChain)
  const projectRef = useRef(project)
  documentsRef.current = documents
  requirementsRef.current = requirements
  auditRef.current = auditChain
  projectRef.current = project

  const refreshReadiness = useCallback(
    async (docs: DocumentSlot[], reqs: RequirementRow[], proj: ProjectConfig) => {
      if (reqs.length === 0 || docs.length === 0) return
      const hasUpload = docs.some((d) => d.status !== 'pending' && d.status !== 'reviewing')
      if (adaptive && !demo && !hasUpload) {
        setReadiness(null)
        return
      }
      setReadinessLoading(true)
      setReadinessError(null)
      try {
        const result = await evaluateReadiness(reqs, docs, auditRef.current, proj)
        setReadiness(result)
      } catch (err) {
        setReadinessError(err instanceof Error ? err.message : 'Readiness check failed')
      } finally {
        setReadinessLoading(false)
      }
    },
    [adaptive, demo],
  )

  const bootstrapRequirements = useCallback(
    async (proj: ProjectConfig) => {
      const result = await generateRequirements(proj)
      const slots = documentSlotsFromRequirements(result.requirements)
      if (slots.length === 0) {
        throw new Error('No scannable requirements for this project profile.')
      }
      setRequirements(result.requirements)
      setEmphasis(result.emphasis)
      setScoringProfile(result.scoringProfile)
      setDocuments(slots)
      requirementsRef.current = result.requirements
      documentsRef.current = slots
      await refreshReadiness(slots, result.requirements, proj)
    },
    [refreshReadiness],
  )

  useEffect(() => {
    if (demo) {
      let cancelled = false
      ;(async () => {
        try {
          await bootstrapRequirements(DEMO_PROJECT)
          if (cancelled) return
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
    }

    if (adaptive && phase === 'onboarding' && requirements.length === 0) {
      const stored = loadStoredProject()
      if (!stored) return
      let cancelled = false
      setSetupLoading(true)
      ;(async () => {
        try {
          await bootstrapRequirements(stored)
          projectRef.current = stored
        } catch {
          if (!cancelled) setPhase('setup')
        } finally {
          if (!cancelled) setSetupLoading(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }
  }, [demo, adaptive, phase, requirements.length, bootstrapRequirements])

  const handleProjectSubmit = useCallback(async () => {
    setSetupLoading(true)
    setSetupError(null)
    try {
      saveStoredProject(project)
      projectRef.current = project
      await bootstrapRequirements(project)
      setPhase('onboarding')
      setAuditChain([])
      auditRef.current = []
      if (audit) {
        try {
          const chain = await appendAuditEvent(
            [],
            'project_initialized',
            `project/${project.name}`,
            `${project.projectType} · ${project.fundingType}`,
          )
          setAuditChain(chain)
          auditRef.current = chain
        } catch {
          /* optional */
        }
      }
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Could not generate requirements')
    } finally {
      setSetupLoading(false)
    }
  }, [project, bootstrapRequirements, audit])

  const resetProject = useCallback(() => {
    clearStoredProject()
    setPhase('setup')
    setProject({ ...DEFAULT_PROJECT })
    setRequirements([])
    setDocuments([])
    setReadiness(null)
    setEmphasis('')
    setAuditChain([])
  }, [])

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
            `project/${projectRef.current.name}/sub/${auditNote.docId}`,
            `${auditNote.fileName}: ${auditNote.status}`,
          )
          setAuditChain(chain)
          auditRef.current = chain
        } catch {
          /* optional */
        }
      }

      await refreshReadiness(nextDocs, requirementsRef.current, projectRef.current)
    },
    [audit, refreshReadiness],
  )

  const handleUpload = useCallback(
    async (file: File, ocrText: string) => {
      const detected = detectDocType(ocrText, file.name)
      const targetId =
        detected ??
        documentsRef.current.find((d) => d.status === 'pending')?.id ??
        documentsRef.current[0]?.id

      if (!targetId) return

      updateDoc(targetId, { status: 'reviewing', fileName: file.name })
      setProcessing(true)

      try {
        const triage = await triageDocument(
          ocrText,
          targetId,
          demo ? DEMO_PROJECT : projectRef.current,
        )
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
    [updateDoc, commitDocsAndRefresh, demo],
  )

  const applyTriageResult = useCallback(
    async (docId: DocType, fileName: string, ocrText: string) => {
      updateDoc(docId, { status: 'reviewing', fileName })
      setProcessing(true)
      try {
        const triage = await triageDocument(
          ocrText,
          docId,
          demo ? DEMO_PROJECT : projectRef.current,
        )
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
    [updateDoc, commitDocsAndRefresh, demo],
  )

  const allDone =
    documents.length > 0 &&
    documents.every((d) => d.status !== 'pending' && d.status !== 'reviewing')
  const canGenerateLink =
    allDone &&
    (readiness?.mobilizationReady || (readiness != null && readiness.overallScore >= 75))

  const displayRequirements = mergeRequirementsForDisplay(requirements, documents)

  const projectSummary = [
    project.projectType.replace(/_/g, ' '),
    project.fundingType.replace(/_/g, ' '),
    project.riskLevel + ' risk',
  ].join(' · ')

  return {
    phase,
    project,
    setProject,
    emphasis,
    scoringProfile,
    setupLoading,
    setupError,
    handleProjectSubmit,
    resetProject,
    projectSummary,
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
