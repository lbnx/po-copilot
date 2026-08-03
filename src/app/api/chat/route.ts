import OpenAI from "openai";
import { DOCUMENT_CATALOG } from "@/lib/documents";
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
/** Pausa entre documentos para no chocar TPM de Groq */
const DOC_COOLDOWN_MS = 10000;
const RETRY_BASE_MS = 8000;
const RETRY_MAX_ATTEMPTS = 5;
const DOC_MAX_TOKENS = 1536;

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
  // Backoff exponencial: 8s, 16s, 32s, 64s…
  return RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

function buildInterviewContext(messages: ChatMessage[]): string {
  const userBits = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter((c) => c.length > 0)
    .filter(
      (c) =>
        !/generar\s+documentos|generá\s+los\s+docs|crea\s+los\s+14/i.test(c),
    );

  if (userBits.length === 0) {
    return messages[0]?.content?.slice(0, 2000) ?? "";
  }

  return userBits.join("\n---\n").slice(0, 2500);
}

/** Últimos N mensajes (FASE 2/3) o first+last (FASE 1). */
function buildHistoryWindow(
  messages: ChatMessage[],
  phase: "interview" | "canvas" | "documents",
): ChatMessage[] {
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
      if (!isQuotaError(err)) throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Cuota agotada en Groq");
}

/** Genera un doc con reintentos TPM/429 (backoff + no cuelga la app). */
async function generateOneDocument(
  groq: OpenAI,
  docMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  push: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let attempt = 0;

  while (attempt < RETRY_MAX_ATTEMPTS) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    attempt += 1;
    try {
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
        // Heartbeats para que el cliente no parezca colgado
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
            push(`💤 Aún enfriando TPM… (${Math.ceil((waitMs - waited) / 1000)}s)\n`);
          }
        }
        continue;
      }
      throw err;
    }
  }

  throw new Error("No se pudo generar el documento tras reintentos TPM");
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

  // ─── FASE 3: for...of secuencial + delay 4s + retry 429 + abort ───
  if (phase === "documents") {
    const interviewContext = buildInterviewContext(messages);
    const history = buildHistoryWindow(messages, "documents");
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
            `🏭 Factoría secuencial: 1 doc por vez + pausa ${DOC_COOLDOWN_MS / 1000}s (anti-TPM) + reintentos automáticos.\n\n`,
          );

          for (const [i, doc] of DOCUMENT_CATALOG.entries()) {
            // Kill switch: inicio de cada iteración
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

            const docMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
              { role: "system", content: system },
              ...history.map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })),
              {
                role: "user",
                content: [
                  "Contexto entrevista (sombreros):",
                  interviewContext || "(sin contexto)",
                  "",
                  `Generá SOLO ${doc.id} con alta densidad. PROHIBIDO SER ESCUETO.`,
                ].join("\n"),
              },
            ];

            try {
              if (signal.aborted) break;
              const full = await generateOneDocument(
                groq,
                docMessages,
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
              if (isQuotaError(err)) {
                const waitMs = retryDelayMs(RETRY_MAX_ATTEMPTS, err);
                push(
                  `\n⚠️ ${doc.id} agotó reintentos TPM. Enfriando ${Math.ceil(waitMs / 1000)}s y sigo con el siguiente…\n\n`,
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

            // Pausa anti-TPM entre documentos (excepto el último)
            if (i < DOCUMENT_CATALOG.length - 1) {
              if (signal.aborted) {
                push(
                  "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                );
                break;
              }
              push(
                `💤 Enfriando TPM (${DOC_COOLDOWN_MS / 1000}s) antes del siguiente…\n\n`,
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
        "X-Doc-Mode": "sequential+delay+retry+abortable",
        "X-Memory-Window": String(HISTORY_WINDOW),
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
