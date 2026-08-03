export type DocId =
  | "PRD"
  | "MRD"
  | "BRD"
  | "SRD"
  | "SRS"
  | "FRD"
  | "NFR"
  | "TRD"
  | "TDD"
  | "API_SPEC"
  | "ADR"
  | "TEST_PLAN"
  | "RUNBOOK"
  | "PLAYBOOK";

export type DocStatus = "pending" | "generating" | "ready";

export interface TechDocument {
  id: DocId;
  name: string;
  shortName: string;
  focus: string;
  status: DocStatus;
  content: string;
}

export const DOCUMENT_CATALOG: Omit<TechDocument, "status" | "content">[] = [
  {
    id: "PRD",
    name: "Product Requirements Document",
    shortName: "PRD",
    focus: "Solo historias de usuario, journeys y criterios de aceptación UX",
  },
  {
    id: "MRD",
    name: "Market Requirements Document",
    shortName: "MRD",
    focus: "Mercado, segmentos, competencia y oportunidades",
  },
  {
    id: "BRD",
    name: "Business Requirements Document",
    shortName: "BRD",
    focus: "Solo métricas, KPIs, ROI, stakeholders y reglas de negocio",
  },
  {
    id: "SRD",
    name: "Software/System Requirements Document",
    shortName: "SRD",
    focus: "Requisitos de sistema/software, límites e integraciones externas",
  },
  {
    id: "SRS",
    name: "Software Requirements Specification",
    shortName: "SRS",
    focus: "Especificación formal de software (alcance, supuestos, glosario)",
  },
  {
    id: "FRD",
    name: "Functional Requirements Document",
    shortName: "FRD",
    focus: "Flujos funcionales detallados, casos de uso y reglas de negocio (sin APIs/DB)",
  },
  {
    id: "NFR",
    name: "Non-Functional Requirements",
    shortName: "NFR",
    focus: "Performance, seguridad, disponibilidad, escalabilidad",
  },
  {
    id: "TRD",
    name: "Technical Requirements Document",
    shortName: "TRD",
    focus: "Arquitectura técnica, stack, datos y restricciones de implementación",
  },
  {
    id: "TDD",
    name: "Technical Design Document",
    shortName: "TDD",
    focus: "Diseño técnico detallado: componentes, secuencias, diagramas",
  },
  {
    id: "API_SPEC",
    name: "API Spec (Especificación de APIs)",
    shortName: "API Spec",
    focus: "Solo endpoints, schemas JSON, auth, errores y ejemplos",
  },
  {
    id: "ADR",
    name: "Architecture Decision Record",
    shortName: "ADR",
    focus: "Decisiones arquitectónicas (contexto, opciones, decisión)",
  },
  {
    id: "TEST_PLAN",
    name: "Test Plan (Plan de pruebas)",
    shortName: "Test Plan",
    focus: "Estrategia QA, casos, cobertura y criterios de salida",
  },
  {
    id: "RUNBOOK",
    name: "Runbook (Manual operativo)",
    shortName: "Runbook",
    focus: "Operación: despliegue, monitoreo, incidentes y rollback",
  },
  {
    id: "PLAYBOOK",
    name: "Playbook (Guía de procedimientos)",
    shortName: "Playbook",
    focus: "Playbook de lanzamiento, go-to-market y operación de producto",
  },
];

export function createEmptyDocuments(): TechDocument[] {
  return DOCUMENT_CATALOG.map((doc) => ({
    ...doc,
    status: "pending" as const,
    content: "",
  }));
}

const DOC_BLOCK_REGEX =
  /===DOC:([A-Z_]+)===\s*([\s\S]*?)\s*===END:\1===/g;

export function parseDocumentsFromText(
  text: string,
): Partial<Record<DocId, string>> {
  const found: Partial<Record<DocId, string>> = {};
  const validIds = new Set(DOCUMENT_CATALOG.map((d) => d.id));

  for (const match of text.matchAll(DOC_BLOCK_REGEX)) {
    const id = match[1] as DocId;
    const content = match[2]?.trim() ?? "";
    if (validIds.has(id) && content) {
      found[id] = content;
    }
  }

  return found;
}

export function stripDocumentBlocks(text: string): string {
  let cleaned = text.replace(DOC_BLOCK_REGEX, "");
  cleaned = cleaned.replace(/===DOC:[A-Z_]+===[\s\S]*$/, "");
  return cleaned.trim();
}
