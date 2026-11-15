/**
 * 文档 5.5：统一的 AI Provider 接口。
 * 不同 AI 服务通过适配器接入；业务层只依赖此接口，不直接依赖任何厂商 SDK。
 */
export interface AIProvider {
  readonly id: string;
  readonly label: string;
  /** false 表示模拟/未配置，UI 必须显式标注，绝不冒充真实 AI */
  readonly isReal: boolean;
  generate(input: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<{
    content: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  }>;
}

export type AIProviderMode = "none" | "mock" | "openai-compatible";
