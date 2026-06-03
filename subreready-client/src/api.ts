import type { DocType, DocumentSlot, TriageResult } from './types'

export interface DemoProject {
  name: string
  address: string
  projectType: string
  ownerType: string
  fundingType: string
  laborClassification: string
  setAside: string
  riskLevel: string
  gcLegalName: string
}

export const DEMO_PROJECT: DemoProject = {
  name: '42 Maple Street Remodel',
  address: '42 Maple Street, Beacon, NY',
  projectType: 'residential',
  ownerType: 'private_owner',
  fundingType: 'private',
  laborClassification: 'non_prevailing_wage',
  setAside: 'none',
  riskLevel: 'low',
  gcLegalName: 'Sevin Construction LLC',
}

export interface RequirementRow {
  docType: string
  label: string
  tier: string
  status: string
  triageStatus?: string | null
  validityState?: string | null
  expirationDate?: string | null
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
  project: DemoProject = DEMO_PROJECT,
): Promise<TriageResult> {
  const res = await fetch('/api/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ocrText,
      docType,
      requirementTier: 'required',
      project,
    }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function generateRequirements(
  project: DemoProject = DEMO_PROJECT,
): Promise<RequirementRow[]> {
  const res = await fetch('/api/requirements/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const data = (await res.json()) as { requirements: RequirementRow[] }
  return data.requirements
}

/** Doc types the upload UI can capture (demo focuses on COI + W-9). */
export const TRACKED_DOC_TYPES = ['coi', 'w9'] as const

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
    }
  })
}

export async function evaluateReadiness(
  serverRequirements: RequirementRow[],
  documents: DocumentSlot[],
  auditChain: AuditEvent[],
  project: DemoProject = DEMO_PROJECT,
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
