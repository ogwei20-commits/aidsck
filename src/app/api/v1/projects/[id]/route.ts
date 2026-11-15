import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { patchProjectSchema } from "@/lib/validation/schemas";
import { getProject, patchProject } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

// Next.js 16：params 是 Promise，必须 await
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    return ok(await getProject(getEnv().APP_USER_ID, id));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const input = parseInput(patchProjectSchema, await readJson(request));
    return ok(await patchProject(getEnv().APP_USER_ID, id, input));
  } catch (error) {
    return fail(error);
  }
}
