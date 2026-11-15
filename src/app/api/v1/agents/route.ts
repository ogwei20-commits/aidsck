import { ok } from "@/lib/errors/api";
import { getAgentDefinitions } from "@/server/ai/agents/registry";
import { TOOL_REGISTRY } from "@/server/ai/tools/registry";
import { getProviderStatus } from "@/server/ai/providers";

export const dynamic = "force-dynamic";

/**
 * 返回真实存在的「注册定义」，但明确标注全部为 planned。
 * 不伪装成可执行 Agent，不返回虚构的运行次数或成功率。
 */
export async function GET() {
  return ok({
    provider: getProviderStatus(),
    agents: getAgentDefinitions(),
    tools: TOOL_REGISTRY,
    notice: "Agent 注册定义已建立，调度器与运行记录将在 Sprint 4 接入。当前不可执行任何 Agent 任务。",
  });
}
