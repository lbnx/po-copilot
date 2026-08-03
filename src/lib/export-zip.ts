import JSZip from "jszip";
import type { UiMessage } from "@/components/ChatPanel";
import type { TechDocument } from "@/lib/documents";
import {
  splitChatContent,
  type InteractiveCanvasData,
} from "@/lib/interactive-canvas";
import { sanitizeFilename } from "@/lib/download";

export type ExportZipInput = {
  productName?: string;
  messages: UiMessage[];
  documents: TechDocument[];
};

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractLatestCanvas(
  messages: UiMessage[],
): InteractiveCanvasData | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.content) continue;
    // Prefer tagged/parsed segments; evita re-parse pesado de todo el historial
    if (
      !/"businessModel"|"wireframes"|<interactive_canvas>/i.test(msg.content)
    ) {
      continue;
    }
    const segments = splitChatContent(msg.content);
    for (let j = segments.length - 1; j >= 0; j -= 1) {
      const seg = segments[j];
      if (seg.type === "canvas") return seg.data;
    }
  }
  return null;
}

function canvasToMarkdown(canvas: InteractiveCanvasData): string {
  const lines: string[] = [
    `# Business Canvas — ${canvas.productName || "Producto"}`,
    "",
    `**Plataforma:** ${canvas.platform ?? "mobile"}`,
    "",
  ];

  if (canvas.tagline) {
    lines.push(`> ${canvas.tagline}`, "");
  }

  const bm = canvas.businessModel;
  if (bm) {
    lines.push("## Modelo de negocio", "");
    if (bm.productSummary) {
      lines.push("### Resumen del producto", "", bm.productSummary, "");
    }
    const sections: [string, string[] | undefined][] = [
      ["Glosario", bm.glossary],
      ["Competencia y mercado", bm.competitorsAndMarket],
      ["Atributos y fricciones", bm.attributesAndFrictions],
      ["Legal y cumplimiento", bm.legalAndCompliance],
      ["Objetivos e indicadores", bm.objectivesAndKPIs],
    ];
    for (const [title, items] of sections) {
      if (!items?.length) continue;
      lines.push(`### ${title}`, "");
      for (const item of items) lines.push(`- ${item}`);
      lines.push("");
    }
  }

  const wireframes = canvas.wireframes ?? [];
  if (wireframes.length > 0) {
    lines.push("## Wireframes / Prototipo", "");
    for (const screen of wireframes) {
      const name = screen.screenName || screen.title;
      lines.push(`### ${name}`);
      if (screen.layout || screen.description) {
        lines.push("", screen.layout || screen.description || "");
      }
      const els = screen.uiElements?.length
        ? screen.uiElements
        : screen.elements.map((el) => ({
            type: el.type,
            description: el.description || el.name || el.text || "",
          }));
      if (els.length) {
        lines.push("", "**Elementos UI:**");
        for (const el of els) {
          lines.push(`- **${el.type}**: ${el.description}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Empaqueta Canvas + documentos técnicos en un ZIP estructurado y lo descarga.
 */
export async function exportToZip(input: ExportZipInput): Promise<void> {
  const productSlug = sanitizeFilename(input.productName || "Proyecto_CPO");
  const root = `${productSlug}_${todayStamp()}`;
  const zip = new JSZip();
  const folder = zip.folder(root);
  if (!folder) throw new Error("No se pudo crear la carpeta del ZIP");

  const canvas = extractLatestCanvas(input.messages);
  if (canvas) {
    folder.file(
      "Business_Canvas.json",
      JSON.stringify(canvas, null, 2),
    );
    folder.file("Business_Canvas.md", canvasToMarkdown(canvas));
  } else {
    folder.file(
      "Business_Canvas.md",
      "# Business Canvas\n\n_Aún no hay canvas generado. Usá «Generar Business + App»._\n",
    );
  }

  const docsFolder = folder.folder("Documentos_Tecnicos");
  if (!docsFolder) throw new Error("No se pudo crear Documentos_Tecnicos");

  let written = 0;
  for (const doc of input.documents) {
    const fileName = `${sanitizeFilename(doc.shortName || doc.id)}.md`;
    if (doc.status === "ready" && doc.content.trim()) {
      const body = `# ${doc.name} (${doc.shortName})\n\n${doc.content.trim()}\n`;
      docsFolder.file(fileName, body);
      written += 1;
    } else {
      docsFolder.file(
        fileName,
        `# ${doc.name} (${doc.shortName})\n\n_Documento pendiente de generación._\n`,
      );
    }
  }

  folder.file(
    "README.md",
    [
      `# ${input.productName || "Proyecto CPO"}`,
      "",
      `Exportado: ${new Date().toISOString()}`,
      "",
      "## Contenido",
      "",
      "- `Business_Canvas.json` / `Business_Canvas.md` — modelo de negocio + wireframes",
      "- `Documentos_Tecnicos/` — suite de documentos (PRD, FRD, BRD, …)",
      "",
      `Documentos con contenido: ${written}/${input.documents.length}`,
      "",
    ].join("\n"),
  );

  const blob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(blob, `${root}.zip`);
}
