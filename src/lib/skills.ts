import { promises as fs } from "fs";
import path from "path";

export type AgentPhase = "interview" | "canvas" | "documents";

/**
 * Inyección híbrida: FASE 2/3 cargan varios sombreros (cada uno .slice(0,1200)).
 */
const PHASE_SKILL_PATHS: Record<AgentPhase, string[]> = {
  interview: ["cpo-prd-coach/SKILL.md", "product-strategy/SKILL.md"],
  // CPO/negocio + UX/UI diseño
  canvas: ["product-strategy/SKILL.md", "ui-designer/README.md"],
  // Negocio + PRD coach
  documents: ["cpo-prd-coach/SKILL.md", "product-strategy/SKILL.md"],
};

const CANVAS_INTENT =
  /\b(generar\s+business|business\s*\+\s*app|business\s+y\s+canvas|canvas\s+de\s+app|business\s*&\s*canvas|business\s+and\s+canvas|prototipo|prototype|canvas|wireframe|wireframes|pantallas|figma|mockup|mockups|tablero\s+visual)\b/i;

const DOCUMENTS_INTENT =
  /\b(generar\s+documentos|generá\s+los\s+docs|crea\s+los\s+14|factor[ií]a|artefactos|\bFRD\b|\bPRD\b|\bBRD\b|\bMRD\b|\bTRD\b|documentos\s+t[eé]cnicos)\b/i;

const SKILL_CHAR_LIMIT = 1200;

function resolveSkillRoots(): string[] {
  return [
    path.join(/* turbopackIgnore: true */ process.cwd(), "skills"),
    path.join(/* turbopackIgnore: true */ process.cwd(), "skill"),
  ];
}

async function readSkillFile(
  relativePath: string,
): Promise<{ relative: string; content: string } | null> {
  for (const root of resolveSkillRoots()) {
    const full = path.join(root, relativePath);
    try {
      const content = await fs.readFile(full, "utf8");
      return {
        relative: path.relative(process.cwd(), full),
        content: content.trim(),
      };
    } catch {
      // try next root
    }
  }
  return null;
}

export function detectAgentPhase(
  messages: { role: string; content: string }[],
): AgentPhase {
  const lastUser = [...messages]
    .reverse()
    .find((m) => m.role === "user")?.content;

  if (lastUser) {
    if (CANVAS_INTENT.test(lastUser)) return "canvas";
    if (DOCUMENTS_INTENT.test(lastUser)) return "documents";
  }

  const last = messages[messages.length - 1]?.content ?? "";
  if (CANVAS_INTENT.test(last)) return "canvas";
  if (DOCUMENTS_INTENT.test(last)) return "documents";

  return "interview";
}

export function phaseLabel(phase: AgentPhase): string {
  switch (phase) {
    case "interview":
      return "FASE 1 — Entrevista de Sombreros (skill CPO/negocio)";
    case "canvas":
      return "FASE 2 — Canvas & Prototipo (CPO + UX/UI)";
    case "documents":
      return "FASE 3 — Factoría de Documentos (CPO + estrategia)";
  }
}

/**
 * Carga TODOS los skills de la fase, cada uno truncado a 1500 chars, concatenados.
 */
export async function loadSkillsForPhase(phase: AgentPhase): Promise<string> {
  const candidates = PHASE_SKILL_PATHS[phase];
  const chunks: string[] = [
    `FASE ACTIVA: ${phaseLabel(phase)}`,
    `INYECCIÓN HÍBRIDA: hasta ${candidates.length} skills × ${SKILL_CHAR_LIMIT} chars`,
  ];

  let loaded = 0;
  for (const rel of candidates) {
    const found = await readSkillFile(rel);
    if (!found) continue;
    loaded += 1;
    const truncated = found.content.slice(0, SKILL_CHAR_LIMIT);
    const wasTruncated = found.content.length > SKILL_CHAR_LIMIT;
    chunks.push(
      [
        `----- SKILL FILE: ${found.relative}${wasTruncated ? ` [truncado a ${SKILL_CHAR_LIMIT}]` : ""} -----`,
        truncated,
        `----- END SKILL FILE: ${found.relative} -----`,
      ].join("\n"),
    );
  }

  if (loaded === 0) {
    return `(No se encontraron skills para ${phase}. Candidatos: ${candidates.join(", ")})`;
  }

  return chunks.join("\n\n");
}

export async function loadSkillsContext(): Promise<string> {
  return loadSkillsForPhase("interview");
}
