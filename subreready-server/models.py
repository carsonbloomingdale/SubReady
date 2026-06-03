from pydantic import BaseModel, Field
from typing import Any, Literal


class ProjectCreate(BaseModel):
    name: str = ""
    projectType: str
    ownerType: str
    fundingType: str
    laborClassification: str = "non_prevailing_wage"
    setAside: str = "none"
    riskLevel: str = "low"
    jurisdiction: str = "US-NY"
    contractValueBand: str = "under_100k"
    tradeScope: str = "general"
    gcLegalName: str = ""


class TriageRequest(BaseModel):
    ocrText: str = ""
    docType: str | None = None
    requirementTier: Literal["required", "optional", "conditional"] = "required"
    project: ProjectCreate | None = None


class RequirementsRequest(BaseModel):
    project: ProjectCreate


class OperationalSignalsInput(BaseModel):
    uploadsCompleted: int = 0
    uploadsExpected: int = 0
    avgResponseMinutes: float | None = None
    hasContactInfo: bool = False
    hasSafetyDocumentation: bool = False
    inconsistentFields: list[str] = Field(default_factory=list)


class ReadinessRequest(BaseModel):
    project: ProjectCreate
    requirements: list[dict[str, Any]] = Field(default_factory=list)
    operationalSignals: OperationalSignalsInput | None = None
    auditChain: list[dict[str, Any]] = Field(default_factory=list)


class AuditAppendRequest(BaseModel):
    chain: list[dict[str, Any]] = Field(default_factory=list)
    action: str
    actor: str = "gc"
    entityRef: str
    note: str = ""
    documentHash: str | None = None
