import {
  getDatabasePath,
  listProjectVersions,
  saveProjectVersion,
} from "@/lib/versions-db";
import type { UiMessage } from "@/components/ChatPanel";
import type { TechDocument } from "@/lib/documents";

export const runtime = "nodejs";

export async function GET() {
  try {
    const versions = listProjectVersions();
    return Response.json({
      ok: true,
      dbPath: getDatabasePath(),
      versions,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error listando versiones";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      productName?: string;
      messages?: UiMessage[];
      documents?: TechDocument[];
    };

    if (!Array.isArray(body.messages) || !Array.isArray(body.documents)) {
      return Response.json(
        { ok: false, error: "Faltan messages o documents" },
        { status: 400 },
      );
    }

    const saved = saveProjectVersion({
      name: body.name,
      productName: body.productName || "Producto",
      messages: body.messages,
      documents: body.documents,
    });

    return Response.json({
      ok: true,
      dbPath: getDatabasePath(),
      version: saved,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error guardando versión";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
