import { ok } from "@/lib/errors/api";
import { getAgentDefinitions } from "@/server/ai/agents/registry";
import { TOOL_REGISTRY } from "@/server/ai/tools/registry";
import { getProviderStatus } from "@/server/ai/providers";

export const dynamic = "force-dynamic";

/**
 * 返回 Agent 的注册定义与工具白名单。
 * 这里的 status 是「定义状态」，不是「这次跑没跑过」——真实执行历史请查 /api/v1/agent-runs/:id。
 * 不返回虚构的成功率或运行次数。
 */
export async function GET() {
  return ok({
    provider: getProviderStatus(),
    agents: getAgentDefinitions(),
    tools: TOOL_REGISTRY,
    notice:
      "6 个 Agent 均可通过 POST /api/v1/agents/:id/run 或 POST /api/v1/tasks/:id/run 真实执行。" +
      "当前 AI_PROVIDER=none，产出为研究框架（不含结论）；执行历史见「执行记录」页。",
  });
}
