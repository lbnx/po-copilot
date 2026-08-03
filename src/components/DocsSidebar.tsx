"use client";

import type { TechDocument } from "@/lib/documents";
import {
  buildProductSlug,
  downloadDocument,
} from "@/lib/download";

type DocsSidebarProps = {
  documents: TechDocument[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  readyCount: number;
  productName?: string;
};

export function DocsSidebar({
  documents,
  selectedId,
  onSelect,
  readyCount,
  productName = "Producto",
}: DocsSidebarProps) {
  const productSlug = buildProductSlug(productName);
  const readyDocs = documents.filter(
    (d) => d.status === "ready" && d.content.trim().length > 0,
  );

  function handleDownloadOne(doc: TechDocument, e: React.MouseEvent) {
    e.stopPropagation();
    if (doc.status !== "ready" || !doc.content.trim()) return;
    downloadDocument(`${productSlug}_${doc.shortName}`, doc.content);
  }

  function handleDownloadAll() {
    if (readyDocs.length === 0) return;
    const consolidated = readyDocs
      .map(
        (doc) =>
          `# ${doc.name} (${doc.shortName})\n\n${doc.content.trim()}\n`,
      )
      .join("\n\n---\n\n");
    downloadDocument("Product_Documentation_Completa", consolidated);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--line)] bg-[var(--panel)]/60">
      <header className="shrink-0 border-b border-[var(--line)] px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Factoría
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          14 documentos técnicos
        </h2>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Progreso</span>
            <span>{readyCount}/14</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${(readyCount / 14) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={readyDocs.length === 0}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-3 py-2.5 text-xs font-semibold text-[var(--paper)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          title={
            readyDocs.length === 0
              ? "Generá al menos un documento para descargar"
              : `Descargar ${readyDocs.length} documentos en un .md`
          }
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          Descargar Todo
          {readyDocs.length > 0 ? ` (${readyDocs.length})` : ""}
        </button>
      </header>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {documents.map((doc, index) => {
          const isSelected = selectedId === doc.id;
          const canDownload = doc.status === "ready" && !!doc.content.trim();
          return (
            <li key={doc.id}>
              <div
                className={`flex w-full items-start gap-2 rounded-xl px-2 py-2 transition ${
                  isSelected
                    ? "bg-white shadow-sm ring-1 ring-[var(--line)]"
                    : "hover:bg-white/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 px-1 py-0.5 text-left"
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                      doc.status === "ready"
                        ? "bg-[var(--ok)]/15 text-[var(--ok)]"
                        : doc.status === "generating"
                          ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                          : "bg-[var(--line)] text-[var(--muted)]"
                    }`}
                  >
                    {doc.status === "ready"
                      ? "✓"
                      : doc.status === "generating"
                        ? "…"
                        : String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--ink)]">
                      {doc.shortName}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                      {doc.focus}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleDownloadOne(doc, e)}
                  disabled={!canDownload}
                  aria-label={`Descargar ${doc.shortName}`}
                  title={
                    canDownload
                      ? `Descargar ${productSlug}_${doc.shortName}.md`
                      : "Disponible cuando el documento esté listo"
                  }
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
