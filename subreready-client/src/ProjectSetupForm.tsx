import type { ProjectConfig } from './api'
import {
  CONTRACT_VALUE_BANDS,
  FUNDING_TYPES,
  LABOR_CLASSIFICATIONS,
  OWNER_TYPES,
  PROJECT_TYPES,
  RISK_LEVELS,
  SET_ASIDE_OPTIONS,
} from './projectOptions'

export const PROJECT_PRESETS: Record<string, Partial<ProjectConfig>> = {
  residential: {
    name: '42 Maple Street Remodel',
    address: '42 Maple Street, Beacon, NY',
    projectType: 'residential',
    ownerType: 'private_owner',
    fundingType: 'private',
    laborClassification: 'non_prevailing_wage',
    setAside: 'none',
    riskLevel: 'low',
    contractValueBand: 'under_100k',
    gcLegalName: 'Sevin Construction LLC',
  },
  municipal: {
    name: 'City Hall ADA Ramp',
    address: '100 Main Street',
    projectType: 'public_infrastructure',
    ownerType: 'municipality',
    fundingType: 'public',
    laborClassification: 'prevailing_wage',
    setAside: 'mwbe',
    riskLevel: 'high',
    contractValueBand: '500k_plus',
    gcLegalName: 'Sevin Construction LLC',
  },
  federal: {
    name: 'Federal Facility Upgrade',
    address: '',
    projectType: 'federal',
    ownerType: 'federal_agency',
    fundingType: 'federal_assistance',
    laborClassification: 'prevailing_wage',
    setAside: 'section_3',
    riskLevel: 'high',
    contractValueBand: '500k_plus',
    gcLegalName: 'Sevin Construction LLC',
  },
}

interface ProjectSetupFormProps {
  value: ProjectConfig
  onChange: (next: ProjectConfig) => void
  onSubmit: () => void
  loading?: boolean
  error?: string | null
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-white focus:border-[#1D9E75] focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export default function ProjectSetupForm({
  value,
  onChange,
  onSubmit,
  loading,
  error,
}: ProjectSetupFormProps) {
  const patch = (p: Partial<ProjectConfig>) => onChange({ ...value, ...p })

  const applyPreset = (key: keyof typeof PROJECT_PRESETS) => {
    onChange({ ...value, ...PROJECT_PRESETS[key] })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="space-y-4"
    >
      <div>
        <p className="text-sm font-semibold text-gray-800">Step 1 — Project setup</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Requirements are generated from job conditions before any uploads.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyPreset('residential')}
          className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-[#1D9E75]"
        >
          Residential preset
        </button>
        <button
          type="button"
          onClick={() => applyPreset('municipal')}
          className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-[#1D9E75]"
        >
          Municipal preset
        </button>
        <button
          type="button"
          onClick={() => applyPreset('federal')}
          className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:border-[#1D9E75]"
        >
          Federal preset
        </button>
      </div>

      <div>
        <FieldLabel>Project name</FieldLabel>
        <input
          required
          value={value.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="e.g. 42 Maple Street Remodel"
        />
      </div>

      <div>
        <FieldLabel>Site address (optional)</FieldLabel>
        <input
          value={value.address}
          onChange={(e) => patch({ address: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="City, state"
        />
      </div>

      <div>
        <FieldLabel>Your company (GC)</FieldLabel>
        <input
          required
          value={value.gcLegalName}
          onChange={(e) => patch({ gcLegalName: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 pt-1 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-700 pt-2">Job classification</p>

        <div>
          <FieldLabel>Project type</FieldLabel>
          <Select
            value={value.projectType}
            onChange={(v) => patch({ projectType: v })}
            options={PROJECT_TYPES}
          />
        </div>

        <div>
          <FieldLabel>Owner type</FieldLabel>
          <Select value={value.ownerType} onChange={(v) => patch({ ownerType: v })} options={OWNER_TYPES} />
        </div>

        <div>
          <FieldLabel>Funding type</FieldLabel>
          <Select
            value={value.fundingType}
            onChange={(v) => patch({ fundingType: v })}
            options={FUNDING_TYPES}
          />
        </div>

        <div>
          <FieldLabel>Labor classification</FieldLabel>
          <Select
            value={value.laborClassification}
            onChange={(v) => patch({ laborClassification: v })}
            options={LABOR_CLASSIFICATIONS}
          />
        </div>

        <div>
          <FieldLabel>Set-aside requirements</FieldLabel>
          <Select value={value.setAside} onChange={(v) => patch({ setAside: v })} options={SET_ASIDE_OPTIONS} />
        </div>

        <div>
          <FieldLabel>Project risk level</FieldLabel>
          <Select value={value.riskLevel} onChange={(v) => patch({ riskLevel: v })} options={RISK_LEVELS} />
        </div>

        <div>
          <FieldLabel>Contract value band</FieldLabel>
          <Select
            value={value.contractValueBand}
            onChange={(v) => patch({ contractValueBand: v })}
            options={CONTRACT_VALUE_BANDS}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !value.name.trim() || !value.gcLegalName.trim()}
        className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[#1D9E75] text-white hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating checklist…' : 'Generate requirements & continue'}
      </button>
    </form>
  )
}
