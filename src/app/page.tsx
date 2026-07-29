"use client";

import { useCallback, useMemo, useState } from "react";
import { ChatPanel, type UiMessage } from "@/components/ChatPanel";
import { DocsSidebar } from "@/components/DocsSidebar";
import { DocumentViewer } from "@/components/DocumentViewer";
import {
  createEmptyDocuments,
  parseDocumentsFromText,
  stripDocumentBlocks,
  type DocId,
  type TechDocument,
} from "@/lib/documents";

const WELCOME: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hola, soy PO Copilot.\n\nDescribe el producto o iniciativa que quieres documentar (ej.: billetera digital, onboarding KYC, créditos digitales).\n\nActuaré como CPO + Compliance y te haré 5 preguntas clave. Si no sabes alguna respuesta, pídeme ayuda con benchmarks o normativas. Cuando estés listo, escribe: generar documentos.",
};

export default function Home() {
  const [messages, setMessages] = useState<UiMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<TechDocument[]>(createEmptyDocuments);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const readyCount = useMemo(
    () => documents.filter((d) => d.status === "ready").length,
    [documents],
  );

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedId) ?? null,
    [documents, selectedId],
  );

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

      const wantsDocs = /generar\s+documentos|generá\s+los\s+docs|crea\s+los\s+14/i.test(
        text,
      );
      if (wantsDocs) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.status === "ready" ? d : { ...d, status: "generating" },
          ),
        );
      }

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
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
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          const display = stripDocumentBlocks(full) || "Redactando documentos…";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: display } : m,
            ),
          );
          mergeParsedDocs(full);
        }

        mergeParsedDocs(full);
        const finalDisplay =
          stripDocumentBlocks(full) ||
          (Object.keys(parseDocumentsFromText(full)).length
            ? "✅ Documentos generados. Ábrelos desde el panel derecho."
            : full);

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
        if (wantsDocs) {
          setDocuments((prev) =>
            prev.map((d) =>
              d.status === "generating" ? { ...d, status: "pending" } : d,
            ),
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, mergeParsedDocs],
  );

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
              CPO · Compliance · Factoría de documentos
            </p>
          </div>
        </div>
        <p className="hidden text-xs text-[var(--muted)] sm:block">
          Powered by Google Gemini
        </p>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ChatPanel
          messages={messages}
          input={input}
          isLoading={isLoading}
          onInputChange={setInput}
          onSend={() => void sendMessage(input)}
          onQuickAction={(text) => void sendMessage(text)}
        />
        <div className="hidden min-h-0 lg:block">
          <DocsSidebar
            documents={documents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            readyCount={readyCount}
          />
        </div>
      </div>

      {/* Mobile docs strip */}
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
      />
    </div>
  );
}
