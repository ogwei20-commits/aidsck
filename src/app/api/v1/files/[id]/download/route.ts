import { getEnv } from "@/lib/config/env";
import { fail } from "@/lib/errors/api";
import { readFileContent } from "@/server/services/files";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const INLINE_SAFE = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

/** GET /api/v1/files/:id/download — 下载原件 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { record, buffer } = await readFileContent(getEnv().APP_USER_ID, id);

    const encoded = encodeURIComponent(record.filename);
    const asciiFallback = record.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    const disposition = INLINE_SAFE.has(record.mimeType) ? "inline" : "attachment";

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
