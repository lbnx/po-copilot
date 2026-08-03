"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatPanel, type UiMessage } from "@/components/ChatPanel";
import { DocsSidebar } from "@/components/DocsSidebar";
import { DocumentViewer } from "@/components/DocumentViewer";
import {
  createEmptyDocuments,
  parseDocumentsFromText,
  type DocId,
  type TechDocument,
} from "@/lib/documents";
import {
  clearSession,
  loadSession,
  saveSession,
} from "@/lib/session-storage";
import { exportToZip } from "@/lib/export-zip";

export const WELCOME: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hola, soy PO Copilot.\n\nDescribe tu producto o iniciativa. Haré una Entrevista de Sombreros (5 preguntas).\n\nFlujo:\n1) Responde las preguntas\n2) Escribe generar business → tablero de impacto + Prototipo Visual\n3) Escribe generar documentos → 14 artefactos técnicos\n\nTu sesión se guarda sola. Usá «Nuevo proyecto» para empezar de cero.",
};

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<TechDocument[]>(createEmptyDocuments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<
    {
      id: number;
      name: string;
      productName: string;
      createdAt: string;
      messageCount: number;
      readyDocs: number;
    }[]
  >([]);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const saved = loadSession();
    if (saved?.messages?.length) {
      setMessages(saved.messages);
      if (saved.documents?.length) {
        setDocuments(saved.documents);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || isLoading) return;
    saveSession({ messages, documents });
  }, [messages, documents, hydrated, isLoading]);

  const readyCount = useMemo(
    () => documents.filter((d) => d.status === "ready").length,
    [documents],
  );

  const productName = useMemo(() => {
    const firstUser = messages.find(
      (m) => m.role === "user" && m.content.trim().length > 0,
    );
    if (!firstUser) return "Producto";
    const line = firstUser.content.trim().split(/\n/)[0] ?? "Producto";
    return line.slice(0, 60);
  }, [messages]);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedId) ?? null,
    [documents, selectedId],
  );

  const stopGeneration = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleSaveVersion = useCallback(async () => {
    if (isSavingVersion || isLoading) return;
    setIsSavingVersion(true);
    setSaveFeedback(null);
    try {
      const res = await fetch("/api/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          messages,
          documents,
          name: `${productName.slice(0, 40)} · ${new Date().toLocaleString("es-PY")}`,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        dbPath?: string;
        version?: { id: number; name: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo guardar la versión");
      }
      if (data.dbPath) setDbPath(data.dbPath);
      setSaveFeedback(
        `Guardada #${data.version?.id ?? "?"} en SQLite local`,
      );
      // También sincroniza sesión del navegador
      saveSession({ messages, documents });
      // Refresca listado si el panel está abierto
      if (showVersions) {
        const listRes = await fetch("/api/versions");
        const listData = (await listRes.json()) as {
          ok?: boolean;
          versions?: typeof versions;
          dbPath?: string;
        };
        if (listData.ok && listData.versions) {
          setVersions(listData.versions);
          if (listData.dbPath) setDbPath(listData.dbPath);
        }
      }
    } catch (err) {
      setSaveFeedback(
        err instanceof Error ? `Error: ${err.message}` : "Error al guardar",
      );
    } finally {
      setIsSavingVersion(false);
      window.setTimeout(() => setSaveFeedback(null), 5000);
    }
  }, [
    isSavingVersion,
    isLoading,
    productName,
    messages,
    documents,
    showVersions,
    versions,
  ]);

  const loadVersionsPanel = useCallback(async () => {
    setShowVersions(true);
    try {
      const res = await fetch("/api/versions");
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        versions?: typeof versions;
        dbPath?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo listar versiones");
      }
      setVersions(data.versions ?? []);
      if (data.dbPath) setDbPath(data.dbPath);
    } catch (err) {
      setSaveFeedback(
        err instanceof Error ? `Error: ${err.message}` : "Error al listar",
      );
    }
  }, [versions]);

  const restoreVersion = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/versions/${id}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        version?: {
          messages: UiMessage[];
          documents: TechDocument[];
          name: string;
        };
      };
      if (!res.ok || !data.ok || !data.version) {
        throw new Error(data.error || "No se pudo restaurar");
      }
      setMessages(data.version.messages);
      setDocuments(data.version.documents);
      saveSession({
        messages: data.version.messages,
        documents: data.version.documents,
      });
      setSelectedId(null);
      setShowVersions(false);
      setSaveFeedback(`Restaurada: ${data.version.name}`);
      window.setTimeout(() => setSaveFeedback(null), 4000);
    } catch (err) {
      setSaveFeedback(
        err instanceof Error ? `Error: ${err.message}` : "Error al restaurar",
      );
    }
  }, []);

  const handleExportZip = useCallback(async () => {
    if (isExporting || isLoading) return;
    setIsExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 0));
      await exportToZip({
        productName,
        messages,
        documents,
      });
    } catch (err) {
      console.error("Export ZIP failed:", err);
      window.alert(
        err instanceof Error
          ? `No se pudo exportar: ${err.message}`
          : "No se pudo exportar el ZIP",
      );
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, isLoading, productName, messages, documents]);

  const resetProject = useCallback(() => {
    stopGeneration();
    clearSession();
    setMessages([WELCOME]);
    setDocuments(createEmptyDocuments());
    setSelectedId(null);
    setInput("");
    setIsLoading(false);
    cancelledRef.current = false;
  }, [stopGeneration]);

  const mergeParsedDocs = useCallback((fullText: string) => {
    const parsed = parseDocumentsFromText(fullText);
    const ids = Object.keys(parsed) as DocId[];
    if (ids.length === 0) return;

    setDocuments((prev) =>
      prev.map((doc) => {
        if (parsed[doc.id]) {
          return {
            ...doc,
            status: "ready",
            content: parsed[doc.id]!,
          };
        }
        return doc;
      }),
    );
  }, []);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isLoading) return;

      // Reinicio limpio antes de una nueva corrida
      cancelledRef.current = false;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: UiMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };

      const apiMessages =
        messages.length === 1 && messages[0]?.id === "welcome"
          ? [{ role: "user" as const, content: text }]
          : [...messages.filter((m) => m.id !== "welcome"), userMsg].map(
              (m) => ({ role: m.role, content: m.content }),
            );

      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setInput("");
      setIsLoading(true);

      const wantsDocs =
        /generar\s+documentos|generá\s+los\s+docs|crea\s+los\s+14/i.test(text);

      // Regenerar todo: limpia docs previos y arranca desde el doc 1
      if (wantsDocs) {
        setSelectedId(null);
        setDocuments(
          createEmptyDocuments().map((d) => ({
            ...d,
            status: "generating" as const,
          })),
        );
      }

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || "Error del servidor");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Sin stream de respuesta");

        const decoder = new TextDecoder();
        let full = "";

        while (true) {
          if (cancelledRef.current || controller.signal.aborted) {
            try {
              await reader.cancel();
            } catch {
              // ignore
            }
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: full || "Redactando respuesta…" }
                : m,
            ),
          );
          mergeParsedDocs(full);
        }

        mergeParsedDocs(full);

        if (cancelledRef.current || controller.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      (full ? `${full.trim()}\n\n` : "") +
                      "🛑 Generación detenida. Modificá el contexto y volvé a pulsar «Generar documentos» para empezar desde cero.",
                  }
                : m,
            ),
          );
          if (wantsDocs) {
            setDocuments((prev) =>
              prev.map((d) =>
                d.status === "generating"
                  ? { ...d, status: d.content ? "ready" : "pending" }
                  : d,
              ),
            );
          }
          return;
        }

        const hasDocs = Object.keys(parseDocumentsFromText(full)).length > 0;
        const finalDisplay =
          full ||
          (hasDocs
            ? "✅ Documentos generados. Ábrelos desde el panel derecho."
            : "");

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: finalDisplay } : m,
          ),
        );

        if (wantsDocs) {
          setDocuments((prev) =>
            prev.map((d) =>
              d.status === "generating" && !d.content
                ? { ...d, status: "pending" }
                : d,
            ),
          );
        }
      } catch (err) {
        const aborted =
          cancelledRef.current ||
          (err instanceof Error && err.name === "AbortError");

        if (aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      "🛑 Generación detenida. Modificá el contexto y volvé a pulsar «Generar documentos» para empezar desde cero.",
                  }
                : m,
            ),
          );
        } else {
          const message =
            err instanceof Error ? err.message : "Error inesperado";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `⚠️ ${message}`,
                  }
                : m,
            ),
          );
        }

        if (wantsDocs) {
          setDocuments((prev) =>
            prev.map((d) =>
              d.status === "generating"
                ? { ...d, status: d.content ? "ready" : "pending" }
                : d,
            ),
          );
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [isLoading, messages, mergeParsedDocs],
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-[var(--muted)]">
        Recuperando sesión…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--paper)]/85 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ink)] text-sm font-bold text-[var(--paper)]">
            PO
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--ink)]">
              PO Copilot
            </h1>
            <p className="text-[11px] text-[var(--muted)]">
              CPO · Skills · Canvas · Factoría
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isLoading && (
              <button
                type="button"
                onClick={stopGeneration}
                className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
              >
                Detener generación
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSaveVersion()}
              disabled={isLoading || isExporting || isSavingVersion}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)] disabled:opacity-40"
              title="Guarda chat + documentos en SQLite local (data/po-copilot.sqlite)"
            >
              {isSavingVersion ? "Guardando…" : "Guardar versión"}
            </button>
            <button
              type="button"
              onClick={() => void loadVersionsPanel()}
              disabled={isLoading || isExporting}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)] disabled:opacity-40"
              title="Ver versiones en la base SQLite"
            >
              Ver versiones
            </button>
            <button
              type="button"
              onClick={() => void handleExportZip()}
              disabled={isExporting || isSavingVersion}
              className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-deep)] transition hover:bg-[var(--accent)]/20 disabled:opacity-50"
              title="Descarga Canvas + documentos en un ZIP"
            >
              {isExporting ? "Cargando…" : "📦 Exportar a ZIP"}
            </button>
            <button
              type="button"
              onClick={resetProject}
              disabled={isLoading || isExporting || isSavingVersion}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)] disabled:opacity-40"
            >
              Nuevo proyecto
            </button>
          </div>
          {saveFeedback && (
            <p className="max-w-md text-right text-[11px] text-[var(--accent-deep)]">
              {saveFeedback}
            </p>
          )}
        </div>
      </header>

      {showVersions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                  Versiones guardadas
                </h3>
                <p className="mt-1 break-all text-[11px] text-[var(--muted)]">
                  DB: {dbPath || "data/po-copilot.sqlite"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVersions(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--panel)]"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto p-4">
              {versions.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Todavía no hay versiones. Pulsá «Guardar versión».
                </p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">
                        #{v.id} · {v.name}
                      </p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {new Date(v.createdAt).toLocaleString("es-PY")} ·{" "}
                        {v.messageCount} msgs · {v.readyDocs}/14 docs
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void restoreVersion(v.id)}
                      className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Restaurar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ChatPanel
          messages={messages}
          input={input}
          isLoading={isLoading}
          onInputChange={setInput}
          onSend={() => void sendMessage(input)}
          onQuickAction={(text) => void sendMessage(text)}
          onStopGeneration={stopGeneration}
        />
        <div className="hidden min-h-0 lg:block">
          <DocsSidebar
            documents={documents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            readyCount={readyCount}
            productName={productName}
          />
        </div>
      </div>

      <div className="border-t border-[var(--line)] bg-[var(--panel)] px-3 py-2 lg:hidden">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedId(doc.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-[var(--line)] ${
                doc.status === "ready"
                  ? "bg-white text-[var(--ok)]"
                  : "bg-white/50 text-[var(--muted)]"
              }`}
            >
              {doc.shortName}
            </button>
          ))}
        </div>
      </div>

      <DocumentViewer
        document={selectedDoc}
        onClose={() => setSelectedId(null)}
        productName={productName}
      />
    </div>
  );
}
