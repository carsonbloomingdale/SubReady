import type { DocType, DocumentSlot, TriageResult } from './types'
import { UPLOADABLE_DOC_TYPES } from './types'
import { PROJECT_PRESETS } from './ProjectSetupForm'

export type ProjectConfig = {
  name: string
  address: string
  projectType: string
  ownerType: string
  fundingType: string
  laborClassification: string
  setAside: string
  riskLevel: string
  contractValueBand: string
  tradeScope: string
  jurisdiction: string
  gcLegalName: string
}

export const DEFAULT_PROJECT: ProjectConfig = {
  name: '',
  address: '',
  projectType: 'residential',
  ownerType: 'private_owner',
  fundingType: 'private',
  laborClassification: 'non_prevailing_wage',
  setAside: 'none',
  riskLevel: 'low',
  contractValueBand: 'under_100k',
  tradeScope: 'general',
  jurisdiction: 'US-NY',
  gcLegalName: '',
}

/** Fixed GC demo project for /demo route. */
export const DEMO_PROJECT: ProjectConfig = {
  ...DEFAULT_PROJECT,
  ...PROJECT_PRESETS.residential,
} as ProjectConfig

export interface GenerateRequirementsResult {
  requirements: RequirementRow[]
  emphasis: string
  scoringProfile: string
  riskProfile: Record<string, unknown>
}

const STORAGE_KEY = 'subready_project_v1'

export function loadStoredProject(): ProjectConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return { ...DEFAULT_PROJECT, ...JSON.parse(raw) } as ProjectConfig
  } catch {
    return null
  }
}

export function saveStoredProject(project: ProjectConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
}

export function clearStoredProject() {
  localStorage.removeItem(STORAGE_KEY)
}

export interface RequirementRow {
  docType: string
  label: string
  tier: string
  status: string
  triageStatus?: string | null
  validityState?: string | null
  expirationDate?: string | null
  triageFlags?: string[]
}

export interface ReadinessCategory {
  score: number
  weight: number
  weightedContribution: number
  detail?: Record<string, unknown>
}

export interface ReadinessResult {
  overallScore: number
  classification: { id: string; label: string }
  mobilizationReady: boolean
  blocking: string[]
  warnings: string[]
  categories: Record<string, ReadinessCategory>
  disclaimer?: string
}

export interface AuditEvent {
  at: string
  action: string
  actor: string
  entityRef: string
  note: string
  documentHash?: string | null
  previousEventHash: string
  eventHash: string
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}))
  const detail = (body as { detail?: string | { msg?: string }[] }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg ?? String(d)).join('; ')
  return res.statusText || 'Request failed'
}

export async function triageDocument(
  ocrText: string,
  docType: DocType,
  project?: ProjectConfig,
): Promise<TriageResult> {
  const body: Record<string, unknown> = {
    ocrText,
    docType,
    requirementTier: 'required',
  }
  if (project) body.project = project

  const res = await fetch('/api/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function generateRequirements(
  project: ProjectConfig,
): Promise<GenerateRequirementsResult> {
  const res = await fetch('/api/requirements/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = await res.json()
  return {
    requirements: data.requirements,
    emphasis: data.emphasis ?? '',
    scoringProfile: data.scoringProfile ?? 'default',
    riskProfile: data.riskProfile ?? {},
  }
}

export const TRACKED_DOC_TYPES = UPLOADABLE_DOC_TYPES

export function mergeRequirementsForDisplay(
  serverRequirements: RequirementRow[],
  documents: DocumentSlot[],
): RequirementRow[] {
  return serverRequirements.map((req) => {
    const slot = documents.find((d) => d.id === req.docType)
    if (!slot || slot.status === 'pending' || slot.status === 'reviewing') {
      return { ...req, status: 'missing', triageStatus: null }
    }
    if (!(TRACKED_DOC_TYPES as readonly string[]).includes(req.docType)) {
      return { ...req, status: 'missing', triageStatus: null }
    }
    return {
      ...req,
      status: 'triaged',
      triageStatus: slot.triage?.status ?? null,
      validityState: slot.triage?.validityState ?? null,
      expirationDate: slot.triage?.expirationDate ?? null,
      triageFlags: slot.triage?.flags ?? [],
    }
  })
}

export function buildRequirementsPayload(
  serverRequirements: RequirementRow[],
  documents: DocumentSlot[],
): RequirementRow[] {
  const scoped = serverRequirements.filter((r) =>
    (TRACKED_DOC_TYPES as readonly string[]).includes(r.docType),
  )
  return scoped.map((req) => {
    const slot = documents.find((d) => d.id === req.docType)
    if (!slot || slot.status === 'pending' || slot.status === 'reviewing') {
      return {
        ...req,
        status: 'missing',
        triageStatus: null,
        validityState: null,
        expirationDate: null,
      }
    }
    return {
      ...req,
      status: 'triaged',
      triageStatus: slot.triage?.status ?? null,
      validityState: slot.triage?.validityState ?? null,
      expirationDate: slot.triage?.expirationDate ?? null,
      triageFlags: slot.triage?.flags ?? [],
    }
  })
}

export async function evaluateReadiness(
  serverRequirements: RequirementRow[],
  documents: DocumentSlot[],
  auditChain: AuditEvent[],
  project: ProjectConfig,
): Promise<ReadinessResult> {
  const requirements = buildRequirementsPayload(serverRequirements, documents)
  const uploadsCompleted = documents.filter(
    (d) => d.status !== 'pending' && d.status !== 'reviewing',
  ).length
  const uploadsExpected = documents.length

  const res = await fetch('/api/readiness/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project,
      requirements,
      operationalSignals: {
        uploadsCompleted,
        uploadsExpected,
        hasContactInfo: uploadsCompleted > 0,
        hasSafetyDocumentation: false,
      },
      auditChain,
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function appendAuditEvent(
  chain: AuditEvent[],
  action: string,
  entityRef: string,
  note = '',
): Promise<AuditEvent[]> {
  const res = await fetch('/api/audit/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chain,
      action,
      actor: 'gc',
      entityRef,
      note,
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = (await res.json()) as { event: AuditEvent }
  return [...chain, data.event]
}
