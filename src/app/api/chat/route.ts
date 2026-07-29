import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "tu_api_key_aqui") {
    return Response.json(
      {
        error:
          "Falta GEMINI_API_KEY. Copia .env.local.example a .env.local y pega tu key de https://aistudio.google.com/apikey",
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

  const ai = new GoogleGenAI({ apiKey });

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 65536,
      },
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
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
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al conectar con Gemini";
    return Response.json({ error: message }, { status: 500 });
  }
}
