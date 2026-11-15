import { getEnv } from "@/lib/config/env";
import { fail, ok, parseInput, readJson } from "@/lib/errors/api";
import { createTaskSchema } from "@/lib/validation/schemas";
import { createTask, listTasks } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listTasks(getEnv().APP_USER_ID));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseInput(createTaskSchema, await readJson(request));
    const row = await createTask(getEnv().APP_USER_ID, input);
    return ok(row, 201);
  } catch (error) {
    return fail(error);
  }
}
