import { AppError } from "@/lib/errors/api";
import type { AIProvider, AIProviderMode } from "./types";

/** 本地模拟 Provider：只用于验证调用链路，输出必须强制标注「模拟」 */
class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly label = "本地模拟（非真实 AI）";
  readonly isReal = false;

  async generate(input: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }) {
    const last = input.messages.at(-1)?.content ?? "";
    return {
      content: [
        "[模拟输出 · 非真实 AI · 不可作为研究结论]",
        "当前 AI_PROVIDER=mock。系统未连接任何模型，未产生任何费用。",
        `收到输入（仅用于链路自检）：${last.slice(0, 120)}`,
      ].join("\n"),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export interface ProviderStatus {
  mode: AIProviderMode;
  configured: boolean;
  isReal: boolean;
  label: string;
  notice: string;
}

/** 文档 5.5：没有配置可用模型时，系统应提供清晰提示和本地模拟测试模式 */
export function getProviderStatus(): ProviderStatus {
  const mode = (process.env.AI_PROVIDER ?? "none") as AIProviderMode;
  switch (mode) {
    case "mock":
      return {
        mode,
        configured: true,
        isReal: false,
        label: "本地模拟模式",
        notice: "AI 未接入真实模型。所有输出均为模拟，仅用于链路自检，不得作为真实数据或研究结论。",
      };
    case "openai-compatible":
      return {
        mode,
        configured: false,
        isReal: false,
        label: "外部模型（待批准）",
        notice:
          "检测到外部模型配置意图，但第一阶段未实现付费适配器。未经批准不得启用任何付费 AI API，也不可将未授权数据发送给外部模型。",
      };
    default:
      return {
        mode: "none",
        configured: false,
        isReal: false,
        label: "AI 未配置",
        notice:
          "AI_PROVIDER=none：不调用任何模型、不产生任何费用。总管家仍会按内置流程模板拆解并派发，Agent 产出为「研究框架」——列出要回答的问题与要核对的项，不含研究结论。",
      };
  }
}

export function getProvider(): AIProvider | null {
  const status = getProviderStatus();
  if (status.mode === "mock") return new MockProvider();
  if (status.mode === "openai-compatible") {
    throw new AppError(
      "AI_PROVIDER_NOT_APPROVED",
      "未经批准不得启用外部付费 AI 服务。请在人工审批并确认预算后再实现适配器。",
      403,
    );
  }
  return null;
}
