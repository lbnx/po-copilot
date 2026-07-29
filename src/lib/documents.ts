export type DocId =
  | "PRD"
  | "BRD"
  | "TRD"
  | "FRD"
  | "NFR"
  | "USER_JOURNEY"
  | "USER_STORIES"
  | "DATA_MODEL"
  | "API_SPEC"
  | "ARCHITECTURE"
  | "COMPLIANCE"
  | "SECURITY"
  | "TEST_PLAN"
  | "ROADMAP";

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
    focus: "UX, flujos de usuario, criterios de aceptación",
  },
  {
    id: "BRD",
    name: "Business Requirements Document",
    shortName: "BRD",
    focus: "Negocio, KPIs, valor, stakeholders",
  },
  {
    id: "TRD",
    name: "Technical Requirements Document",
    shortName: "TRD",
    focus: "Bases de datos, APIs, integraciones",
  },
  {
    id: "FRD",
    name: "Functional Requirements Document",
    shortName: "FRD",
    focus: "Requisitos funcionales detallados por módulo",
  },
  {
    id: "NFR",
    name: "Non-Functional Requirements",
    shortName: "NFR",
    focus: "Performance, disponibilidad, escalabilidad",
  },
  {
    id: "USER_JOURNEY",
    name: "User Journey Map",
    shortName: "Journey",
    focus: "Mapa de recorridos y momentos críticos",
  },
  {
    id: "USER_STORIES",
    name: "User Stories & Epics",
    shortName: "Stories",
    focus: "Épicas, historias y criterios Given/When/Then",
  },
  {
    id: "DATA_MODEL",
    name: "Data Model / ERD",
    shortName: "Data",
    focus: "Entidades, relaciones y diccionario de datos",
  },
  {
    id: "API_SPEC",
    name: "API Specification",
    shortName: "API",
    focus: "Endpoints, contratos, errores y auth",
  },
  {
    id: "ARCHITECTURE",
    name: "Architecture Document",
    shortName: "Arch",
    focus: "Componentes, diagramas C4, decisiones técnicas",
  },
  {
    id: "COMPLIANCE",
    name: "Compliance Matrix",
    shortName: "Compliance",
    focus: "BCP, SEPRELAD, normativas locales aplicables",
  },
  {
    id: "SECURITY",
    name: "Security & Privacy",
    shortName: "Security",
    focus: "Amenazas, controles, privacidad de datos",
  },
  {
    id: "TEST_PLAN",
    name: "Test Strategy & Plan",
    shortName: "QA",
    focus: "Estrategia de pruebas, casos y riesgos",
  },
  {
    id: "ROADMAP",
    name: "Delivery Roadmap",
    shortName: "Roadmap",
    focus: "Fases de entrega, MVP y dependencias",
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
  // Remove complete blocks, then hide any trailing incomplete DOC block while streaming
  let cleaned = text.replace(DOC_BLOCK_REGEX, "");
  cleaned = cleaned.replace(/===DOC:[A-Z_]+===[\s\S]*$/, "");
  return cleaned.trim();
}
