"use client";

import { useEffect, useRef } from "react";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatPanelProps = {
  messages: UiMessage[];
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onQuickAction: (text: string) => void;
};

export function ChatPanel({
  messages,
  input,
  isLoading,
  onInputChange,
  onSend,
  onQuickAction,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) onSend();
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--line)] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Conversación
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          Briefing del producto
        </h2>
        <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
          Describe tu producto. PO Copilot hará 5 preguntas clave. Cuando
          estés listo, escribe{" "}
          <span className="font-medium text-[var(--accent)]">
            generar documentos
          </span>
          .
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--panel)] text-[var(--ink)] ring-1 ring-[var(--line)]"
              }`}
            >
              {m.role === "assistant" && (
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                  PO Copilot
                </p>
              )}
              {m.content || (isLoading ? "…" : "")}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)] ring-1 ring-[var(--line)]">
              Analizando…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--paper)]/90 px-5 py-4 backdrop-blur">
        <div className="mb-3 flex flex-wrap gap-2">
          <QuickChip
            label="Necesito ayuda con benchmarks"
            onClick={() =>
              onQuickAction(
                "No sé cómo responder. Ayúdame con benchmarks de competidores y normativas aplicables.",
              )
            }
            disabled={isLoading}
          />
          <QuickChip
            label="Generar documentos"
            onClick={() => onQuickAction("generar documentos")}
            disabled={isLoading}
            accent
          />
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ej: Quiero lanzar una billetera digital para remesas en Paraguay…"
            disabled={isLoading}
            className="max-h-40 min-h-[48px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isLoading || !input.trim()}
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </div>
    </section>
  );
}

function QuickChip({
  label,
  onClick,
  disabled,
  accent,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
        accent
          ? "bg-[var(--accent)]/10 text-[var(--accent-deep)] hover:bg-[var(--accent)]/20"
          : "bg-[var(--panel)] text-[var(--muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </button>
  );
}
