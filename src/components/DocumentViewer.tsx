"use client";

import type { TechDocument } from "@/lib/documents";

type DocumentViewerProps = {
  document: TechDocument | null;
  onClose: () => void;
};

export function DocumentViewer({ document, onClose }: DocumentViewerProps) {
  if (!document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-[var(--ink)]/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col bg-[var(--paper)] shadow-2xl animate-slide-in">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              {document.shortName}
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
              {document.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{document.focus}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] ring-1 ring-[var(--line)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
          >
            Cerrar
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {document.status === "ready" && document.content ? (
            <article className="prose-doc whitespace-pre-wrap text-sm leading-7 text-[var(--ink)]">
              {document.content}
            </article>
          ) : document.status === "generating" ? (
            <p className="text-sm text-[var(--muted)]">
              Generando este documento…
            </p>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel)]/50 px-5 py-8 text-center">
              <p className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                Aún no generado
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Completa el briefing en el chat y luego escribe{" "}
                <strong className="text-[var(--accent)]">generar documentos</strong>.
              </p>
            </div>
          )}
        </div>

        {document.status === "ready" && document.content && (
          <footer className="border-t border-[var(--line)] px-6 py-4">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(document.content);
              }}
              className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] hover:opacity-90"
            >
              Copiar contenido
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
