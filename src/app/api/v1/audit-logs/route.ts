import { fail, ok } from "@/lib/errors/api";
import { listAuditLogs } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listAuditLogs(100));
  } catch (error) {
    return fail(error);
  }
}
