import { getProjectVersion, getDatabasePath } from "@/lib/versions-db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return Response.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const version = getProjectVersion(id);
    if (!version) {
      return Response.json(
        { ok: false, error: "Versión no encontrada" },
        { status: 404 },
      );
    }

    return Response.json({
      ok: true,
      dbPath: getDatabasePath(),
      version,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error leyendo versión";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
