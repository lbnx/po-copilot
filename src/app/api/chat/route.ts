import OpenAI from "openai";
import { DOCUMENT_CATALOG } from "@/lib/documents";
import { extractJsonObject } from "@/lib/interactive-canvas";
import {
  detectAgentPhase,
  loadSkillsForPhase,
  phaseLabel,
} from "@/lib/skills";
import {
  buildCanvasPhasePrompt,
  buildSingleDocumentPrompt,
  buildSystemPrompt,
} from "@/lib/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

const GROQ_MODELS = ["llama-3.1-8b-instant"] as const;
const HISTORY_WINDOW = 3;
/** Pausa entre documentos (15s) para reiniciar TPM de Groq */
const DOC_COOLDOWN_MS = 15000;
const RETRY_BASE_MS = 8000;
const RETRY_MAX_ATTEMPTS = 5;
const DOC_MAX_TOKENS = 1400;
/** Caps duros para no superar ~6000 tokens de input en Groq */
const CANVAS_CONTEXT_CHARS = 2200;
const CANVAS_CONTEXT_CHARS_SLIM = 1200;
const BRIEF_CHARS = 400;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sleep cancelable vía AbortSignal (cliente cierra el fetch). */
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError")
  );
}

function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: number }).status)
      : undefined;
  return (
    status === 429 ||
    /429|rate limit|quota|tokens per day|TPD|TPM|too many requests|Please try again/i.test(
      message,
    )
  );
}

function isRequestTooLarge(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: number }).status)
      : undefined;
  return (
    status === 413 ||
    /413|request too large|Requested \d+/i.test(message)
  );
}

/** Extrae segundos sugeridos del mensaje de Groq ("try again in 7.2s"). */
function parseRetryAfterMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.ceil(seconds * 1000) + 1500;
}

function retryDelayMs(attempt: number, err: unknown): number {
  const fromApi = parseRetryAfterMs(err);
  if (fromApi) return Math.max(fromApi, RETRY_BASE_MS);
  return RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

/** Brief corto del producto (primer mensaje de usuario). */
function buildProductBrief(messages: ChatMessage[]): string {
  const firstUser = messages.find(
    (m) =>
      m.role === "user" &&
      m.content.trim().length > 0 &&
      !/generar\s+documentos|generar\s+business|canvas/i.test(m.content),
  );
  return (firstUser?.content ?? messages[0]?.content ?? "")
    .trim()
    .slice(0, BRIEF_CHARS);
}

/**
 * Contexto mínimo para FASE 3: JSON del Business/Canvas (truncado).
 * NO incluye historial completo ni documentos previos.
 */
function extractBusinessCanvasContext(
  messages: ChatMessage[],
  maxChars = CANVAS_CONTEXT_CHARS,
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (
      !/<interactive_canvas>/i.test(m.content) &&
      !/"businessModel"\s*:/i.test(m.content) &&
      !/"wireframes"\s*:/i.test(m.content)
    ) {
      continue;
    }
    try {
      const json = extractJsonObject(m.content);
      if (json.startsWith("{")) {
        return json.slice(0, maxChars);
      }
    } catch {
      // fall through
    }
    return m.content.slice(0, maxChars);
  }
  return "(Sin Business/Canvas previo. Inferí con [RECOMENDACIÓN] según el brief.)";
}

function buildDocumentUserMessage(
  docId: string,
  brief: string,
  canvasJson: string,
): string {
  return [
    "BRIEF DEL PRODUCTO (recortado):",
    brief || "(sin brief)",
    "",
    "BUSINESS + APP CANVAS (JSON truncado — fuente de verdad):",
    canvasJson,
    "",
    `INSTRUCCIÓN: Generá SOLO ${docId}. Usá el canvas de arriba. PROHIBIDO inventar otra app.`,
  ].join("\n");
}

/** Últimos N mensajes (FASE 1/2). FASE 3 NO usa historial completo. */
function buildHistoryWindow(
  messages: ChatMessage[],
  phase: "interview" | "canvas" | "documents",
): ChatMessage[] {
  if (phase === "documents") {
    return [];
  }
  if (phase === "interview") {
    const first = messages[0];
    const last = messages[messages.length - 1];
    const out: ChatMessage[] = [];
    if (first) out.push({ role: first.role, content: first.content });
    if (
      last &&
      !(
        first &&
        first.role === last.role &&
        first.content === last.content
      )
    ) {
      out.push({ role: last.role, content: last.content });
    }
    return out;
  }

  return messages.slice(-HISTORY_WINDOW).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

async function createGroqStream(
  groq: OpenAI,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxTokens = 2048,
) {
  let lastError: unknown = null;

  for (const model of GROQ_MODELS) {
    try {
      const stream = await groq.chat.completions.create({
        model,
        temperature: 0.7,
        max_tokens: maxTokens,
        stream: true,
        messages,
      });
      return { stream, model };
    } catch (err) {
      lastError = err;
      // 413 no se reintenta aquí con el mismo payload; lo maneja el caller
      if (!isQuotaError(err) || isRequestTooLarge(err)) throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Cuota agotada en Groq");
}

/** Genera un doc con reintentos TPM/429 y 413 (payload más chico). */
async function generateOneDocument(
  groq: OpenAI,
  buildMessages: (slim: boolean) => OpenAI.Chat.ChatCompletionMessageParam[],
  push: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let attempt = 0;
  let slim = false;

  while (attempt < RETRY_MAX_ATTEMPTS) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    attempt += 1;
    try {
      const docMessages = buildMessages(slim);
      const { stream } = await createGroqStream(
        groq,
        docMessages,
        DOC_MAX_TOKENS,
      );
      let full = "";
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          full += text;
          push(text);
        }
      }
      return full;
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err;

      if (isRequestTooLarge(err) && attempt < RETRY_MAX_ATTEMPTS) {
        slim = true;
        push(
          `\n📉 Request too large (413). Reintento ${attempt}/${RETRY_MAX_ATTEMPTS} con contexto más corto…\n`,
        );
        await sleepAbortable(1500, signal);
        continue;
      }

      if (isQuotaError(err) && attempt < RETRY_MAX_ATTEMPTS) {
        const waitMs = retryDelayMs(attempt, err);
        const waitSec = Math.ceil(waitMs / 1000);
        console.warn(
          `[Factoría] 429/TPM — reintento ${attempt}/${RETRY_MAX_ATTEMPTS} en ${waitSec}s`,
          err,
        );
        push(
          `\n⏳ Límite TPM/429. Reintento automático ${attempt}/${RETRY_MAX_ATTEMPTS} en ${waitSec}s (sin cancelar la cola)…\n`,
        );
        const slice = Math.min(3000, waitMs);
        let waited = 0;
        while (waited < waitMs) {
          if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          const step = Math.min(slice, waitMs - waited);
          await sleepAbortable(step, signal);
          waited += step;
          if (waited < waitMs) {
            push(
              `💤 Aún enfriando TPM… (${Math.ceil((waitMs - waited) / 1000)}s)\n`,
            );
          }
        }
        continue;
      }
      throw err;
    }
  }

  throw new Error("No se pudo generar el documento tras reintentos");
}

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey.startsWith("tu_")) {
    return Response.json(
      {
        error:
          "Falta GROQ_API_KEY. Copia .env.local.example a .env.local y pega tu key de https://console.groq.com/keys",
      },
      { status: 500 },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return Response.json({ error: "Sin mensajes" }, { status: 400 });
  }

  const phase = detectAgentPhase(messages);
  // Inyección híbrida: skills × 1200 chars
  const skillsContext = await loadSkillsForPhase(phase);

  const groq = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  // ─── FASE 3: secuencial estricto (NUNCA Promise.all) + delay 15s + contexto mínimo ───
  if (phase === "documents") {
    const productBrief = buildProductBrief(messages);
    const canvasFull = extractBusinessCanvasContext(
      messages,
      CANVAS_CONTEXT_CHARS,
    );
    const canvasSlim = extractBusinessCanvasContext(
      messages,
      CANVAS_CONTEXT_CHARS_SLIM,
    );
    const encoder = new TextEncoder();
    const signal = req.signal;

    const readable = new ReadableStream({
      async start(controller) {
        const push = (text: string) => {
          if (signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // stream ya cerrado
          }
        };

        try {
          push(
            `🏭 Factoría SECUENCIAL (1 doc a la vez). Contexto mínimo (canvas truncado). Pausa ${DOC_COOLDOWN_MS / 1000}s entre docs (anti-TPM).\n\n`,
          );

          for (const [i, doc] of DOCUMENT_CATALOG.entries()) {
            if (signal.aborted) {
              push(
                "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
              );
              break;
            }

            push(
              `⏳ [${i + 1}/14] Generando ${doc.shortName} — ${doc.name}...\n`,
            );

            const system = buildSingleDocumentPrompt(
              skillsContext,
              doc.id,
              doc.name,
              doc.focus,
            );

            const buildMessages = (slim: boolean) => {
              const canvas = slim ? canvasSlim : canvasFull;
              return [
                { role: "system" as const, content: system },
                {
                  role: "user" as const,
                  content: buildDocumentUserMessage(
                    doc.id,
                    productBrief,
                    canvas,
                  ),
                },
              ];
            };

            try {
              if (signal.aborted) break;
              const full = await generateOneDocument(
                groq,
                buildMessages,
                push,
                signal,
              );

              if (signal.aborted) {
                push(
                  "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                );
                break;
              }

              if (!full.includes(`===DOC:${doc.id}===`)) {
                push(
                  `\n===DOC:${doc.id}===\n${full.trim()}\n===END:${doc.id}===\n`,
                );
              } else if (!full.includes(`===END:${doc.id}===`)) {
                push(`\n===END:${doc.id}===\n`);
              }

              push(`\n✅ ${doc.shortName} listo\n\n`);
            } catch (err) {
              if (signal.aborted || isAbortError(err)) {
                push(
                  "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                );
                break;
              }
              if (isQuotaError(err) || isRequestTooLarge(err)) {
                const waitMs = retryDelayMs(RETRY_MAX_ATTEMPTS, err);
                push(
                  `\n⚠️ ${doc.id} falló (${isRequestTooLarge(err) ? "413" : "TPM"}). Enfriando ${Math.ceil(waitMs / 1000)}s y sigo con el siguiente…\n\n`,
                );
                try {
                  await sleepAbortable(waitMs, signal);
                } catch (sleepErr) {
                  if (isAbortError(sleepErr) || signal.aborted) {
                    push(
                      "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                    );
                    break;
                  }
                }
              } else {
                const message =
                  err instanceof Error
                    ? err.message
                    : "Error generando documento";
                console.warn(`[Factoría] Falló ${doc.id}:`, err);
                push(`\n⚠️ Falló ${doc.id}: ${message}\n\n`);
              }
            }

            // Delay agresivo anti-TPM: 15s entre documentos (secuencial, sin Promise.all)
            if (i < DOCUMENT_CATALOG.length - 1) {
              if (signal.aborted) {
                push(
                  "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                );
                break;
              }
              push(
                `💤 Esperando ${DOC_COOLDOWN_MS / 1000}s para reiniciar TPM antes del siguiente doc…\n\n`,
              );
              try {
                const slice = 3000;
                let waited = 0;
                while (waited < DOC_COOLDOWN_MS) {
                  if (signal.aborted) {
                    throw new DOMException("Aborted", "AbortError");
                  }
                  const step = Math.min(slice, DOC_COOLDOWN_MS - waited);
                  await sleepAbortable(step, signal);
                  waited += step;
                }
              } catch (err) {
                if (isAbortError(err) || signal.aborted) {
                  push(
                    "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                  );
                  break;
                }
                throw err;
              }
              if (signal.aborted) {
                push(
                  "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                );
                break;
              }
            }
          }

          if (!signal.aborted) {
            push(
              "🎉 Suite documental completa. Revisá el panel derecho / Descargar Todo.\n",
            );
          }
          controller.close();
        } catch (err) {
          if (isAbortError(err) || signal.aborted) {
            push(
              "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
            );
            controller.close();
            return;
          }
          const message =
            err instanceof Error ? err.message : "Error en factoría secuencial";
          push(`\n\n⚠️ Error: ${message}`);
          controller.close();
        }
      },
      cancel() {
        // Cliente abortó el fetch / cerró el reader
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "X-Groq-Model": GROQ_MODELS[0],
        "X-Agent-Phase": phase,
        "X-Agent-Phase-Label": encodeURIComponent(phaseLabel(phase)),
        "X-Doc-Mode": "sequential+15s+min-context",
        "X-Memory-Window": "canvas-only",
      },
    });
  }

  // ─── FASE 2: JSON en <interactive_canvas> + últimos 3 mensajes ───
  if (phase === "canvas") {
    const canvasSystem = buildCanvasPhasePrompt(skillsContext);
    const recentMessages = buildHistoryWindow(messages, "canvas");
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: canvasSystem },
      ...recentMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user",
        content: [
          "FORMATO OBLIGATORIO AHORA:",
          "Responde SOLO con <interactive_canvas>…JSON…</interactive_canvas>.",
          "REGLA DE IDIOMA ESTRICTO: todos los VALORES del JSON 100% en Español (sin inglés).",
          "ENFOQUE APP MÓVIL: platform DEBE ser \"mobile\". PROHIBIDO web/desktop.",
          "ACCIONES INTERNAS: (A) Business Model completo (B) 4–5 pantallas de app específicas (Onboarding, Home, Detalle, Aporte, Perfil).",
          "businessModel: productSummary, glossary, competitorsAndMarket, attributesAndFrictions, legalAndCompliance, objectivesAndKPIs.",
          "MICRO-COPY +/− (6–10 palabras). Si es fintech: BCP y SEPRELAD.",
          "uiElements reales de app en español (navegación inferior, anillo de progreso, botón flotante, etc.).",
        ].join("\n"),
      },
    ];

    try {
      const { stream, model } = await createGroqStream(
        groq,
        chatMessages,
        2048,
      );
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content;
              if (text) controller.enqueue(encoder.encode(text));
            }
            controller.close();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Error al generar canvas";
            controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${message}`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
          "X-Groq-Model": model,
          "X-Agent-Phase": phase,
          "X-Agent-Phase-Label": encodeURIComponent(phaseLabel(phase)),
          "X-Memory-Window": String(HISTORY_WINDOW),
          "X-Skill-Hat": "cpo+ui-designer",
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al conectar con Groq";
      return Response.json(
        { error: message },
        { status: isQuotaError(err) ? 429 : 500 },
      );
    }
  }

  // ─── FASE 1 ───
  const systemInstruction = buildSystemPrompt(skillsContext);
  const recentMessages = buildHistoryWindow(messages, "interview");
  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemInstruction },
    ...recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  try {
    const { stream, model } = await createGroqStream(groq, chatMessages, 2048);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Error al generar respuesta";
          controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${message}`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "X-Groq-Model": model,
        "X-Agent-Phase": phase,
        "X-Agent-Phase-Label": encodeURIComponent(phaseLabel(phase)),
        "X-Memory-Window": "first+last",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al conectar con Groq";
    return Response.json(
      { error: message },
      { status: isQuotaError(err) ? 429 : 500 },
    );
  }
}
