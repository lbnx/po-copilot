"use client";

import type { TechDocument } from "@/lib/documents";

type DocsSidebarProps = {
  documents: TechDocument[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  readyCount: number;
};

export function DocsSidebar({
  documents,
  selectedId,
  onSelect,
  readyCount,
}: DocsSidebarProps) {
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
            <span>
              {readyCount}/14
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${(readyCount / 14) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {documents.map((doc, index) => {
          const isSelected = selectedId === doc.id;
          return (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => onSelect(doc.id)}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  isSelected
                    ? "bg-white shadow-sm ring-1 ring-[var(--line)]"
                    : "hover:bg-white/70"
                }`}
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
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
