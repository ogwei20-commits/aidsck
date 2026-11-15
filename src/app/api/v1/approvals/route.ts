import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { createApprovalSchema } from "@/lib/validation/schemas";
import { createApproval, listApprovals } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

/** 最小审批记录端点：写入 approve/reject 审计记录，供 L3 归档操作校验 */
export async function GET() {
  try {
    return ok(await listApprovals(100));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseInput(createApprovalSchema, await readJson(request));
    return ok(await createApproval(getEnv().APP_USER_ID, input), 201);
  } catch (error) {
    return fail(error);
  }
}
