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
const DOC_COOLDOWN_MS = 4000;
const RETRY_COOLDOWN_MS = 5000;

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
    /429|rate limit|quota|tokens per day|TPD|TPM|too many requests/i.test(
      message,
    )
  );
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

/** Genera un doc con reintento ante 429. Secuencial estricto (sin Promise.all). */
async function generateOneDocument(
  groq: OpenAI,
  docMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  push: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const maxAttempts = 2;
  let attempt = 0;

  while (attempt < maxAttempts) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    attempt += 1;
    try {
      const { stream } = await createGroqStream(groq, docMessages, 2048);
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
      if (isQuotaError(err) && attempt < maxAttempts) {
        console.warn(
          "[Factoría] 429/TPM — reintento en 5s (intento",
          attempt,
          ")",
          err,
        );
        push("\n⏳ Rate limit (429). Reintentando en 5s...\n");
        await sleepAbortable(RETRY_COOLDOWN_MS, signal);
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
            "🏭 Factoría secuencial: 1 doc por vez + pausa 4s (anti-TPM).\n\n",
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
              const message =
                err instanceof Error ? err.message : "Error generando documento";
              console.warn(`[Factoría] Falló ${doc.id}:`, err);
              push(`\n⚠️ Falló ${doc.id} tras reintentos: ${message}\n\n`);
            }

            // Pausa anti-TPM entre documentos (excepto el último)
            if (i < DOCUMENT_CATALOG.length - 1) {
              if (signal.aborted) {
                push(
                  "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                );
                break;
              }
              push("💤 Enfriando TPM (4s)...\n\n");
              try {
                await sleepAbortable(DOC_COOLDOWN_MS, signal);
              } catch (err) {
                if (isAbortError(err) || signal.aborted) {
                  push(
                    "\n🛑 Generación detenida por el usuario. Podés modificar el contexto y volver a generar documentos.\n",
                  );
                  break;
                }
                throw err;
              }
              // Kill switch: justo después del delay
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
          "businessModel: productSummary, glossary, competitorsAndMarket, attributesAndFrictions, legalAndCompliance, objectivesAndKPIs.",
          "MICRO-COPY +/− (6–10 palabras). Si es fintech: BCP y SEPRELAD en legalAndCompliance y glossary.",
          "Incluí platform (mobile|web) y wireframes con uiElements en español.",
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
