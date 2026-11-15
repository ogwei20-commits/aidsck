import { createHash } from "node:crypto";
import type { StepState, WorkflowContext, WorkflowDefinition, WorkflowStep } from "./types";

/**
 * 续跑（失败后从断点继续）的判定与状态迁移，全部是纯函数。
 *
 * 为什么单独一层：续跑最怕的不是「跑不起来」，而是「跑起来了但状态是错的」——
 * 例如把已完成节点重跑一遍、把人工闸门悄悄跳过、或者在定义被改过之后错位执行。
 * 这些判断要能被单测逐条钉住，所以不放在带数据库的引擎里。
 */

/** 同一步最多重试几次（首次执行不计入）。超过就要求人先看原因，而不是无限重试 */
export const MAX_RETRY_ATTEMPTS = 3;

export type ResumeAction = "retry" | "skip";

export interface ResumeRecord {
  at: string;
  stepId: string;
  stepTitle: string;
  action: ResumeAction;
  /** 这是该节点的第几次执行（1 为首次） */
  attempt: number;
  note: string;
}

export interface FailedStep {
  step: WorkflowStep;
  state: StepState;
}

/**
 * 定义指纹：节点 id、类型、执行者。
 * 运行启动时记一份，续跑时比对——定义被改过还接着跑，会按新顺序去执行旧上下文，
 * 产出的归属就全乱了。宁可让人重开一条运行，也不给一个错位的续跑。
 */
export function definitionDigest(def: WorkflowDefinition): string {
  const shape = def.steps.map((s) => [s.id, s.kind, s.agentSlug ?? ""].join(":")).join("|");
  return createHash("sha256").update(shape).digest("hex").slice(0, 16);
}

/** 按定义顺序找第一个失败节点。失败即中断，正常情况下只有一个 */
export function findFailedStep(def: WorkflowDefinition, ctx: WorkflowContext): FailedStep | null {
  for (const step of def.steps) {
    const state = ctx.steps[step.id];
    if (state?.status === "failed") return { step, state };
  }
  return null;
}

/** 已执行次数：首次执行时没有 attempts 字段，按 1 计 */
export function attemptCount(state: StepState | undefined): number {
  return state?.attempts ?? 1;
}

export type ResumeCheck =
  | { ok: true; failed: FailedStep }
  | { ok: false; code: string; status: number; message: string };

/**
 * 能不能续跑、怎么续。所有拒绝都给出「为什么 + 该怎么办」，不是一句 409。
 */
export function checkResumable(input: {
  def: WorkflowDefinition;
  ctx: WorkflowContext;
  runStatus: string;
  action: ResumeAction;
  note: string;
}): ResumeCheck {
  const { def, ctx, runStatus, action, note } = input;

  if (runStatus === "running") {
    return {
      ok: false,
      code: "RUN_BUSY",
      status: 409,
      message: "本次运行正在执行中，等当前节点结束再看。",
    };
  }
  if (runStatus !== "failed") {
    const label: Record<string, string> = {
      queued: "还在等待推进",
      succeeded: "已经跑完",
      cancelled: "已被驳回终止",
    };
    return {
      ok: false,
      code: "RUN_NOT_RESUMABLE",
      status: 409,
      message: `本次运行${label[runStatus] ?? `状态为 ${runStatus}`}，只有中断（failed）的运行才需要续跑。`,
    };
  }

  // 定义变过就拒绝：宁可让人重开，也不给一个错位的续跑
  const current = definitionDigest(def);
  if (ctx.definitionDigest && ctx.definitionDigest !== current) {
    return {
      ok: false,
      code: "WORKFLOW_DEFINITION_CHANGED",
      status: 409,
      message:
        "这条运行启动后流程定义被改过（节点增删或改了执行者），接着跑会错位到别的节点上。" +
        "请回工作流中心重新启动一条运行；已完成的节点产出不会丢，仍在原运行记录里。",
    };
  }
  if (!ctx.definitionDigest) {
    // 老运行没记指纹：退一步比对节点集合，形状不同同样拒绝
    const known = Object.keys(ctx.steps).sort().join(",");
    const now = def.steps.map((s) => s.id).sort().join(",");
    if (ctx.steps && Object.keys(ctx.steps).length > 0 && known !== now) {
      return {
        ok: false,
        code: "WORKFLOW_DEFINITION_CHANGED",
        status: 409,
        message: "这条运行的节点集合与当前流程定义不一致，续跑会错位。请重新启动一条运行。",
      };
    }
  }

  const failed = findFailedStep(def, ctx);
  if (!failed) {
    return {
      ok: false,
      code: "RUN_NO_FAILED_STEP",
      status: 409,
      message: "这条运行没有失败节点，无需续跑。",
    };
  }

  if (action === "retry") {
    const attempts = attemptCount(failed.state);
    if (attempts > MAX_RETRY_ATTEMPTS) {
      return {
        ok: false,
        code: "RESUME_LIMIT_REACHED",
        status: 409,
        message:
          `「${failed.step.title}」已经重试 ${MAX_RETRY_ATTEMPTS} 次仍失败，先别再试了。` +
          "看一眼失败原因：如果是环境或数据问题，修掉之后我这边还能再重试；如果这一步本身跑不通，就跳过它继续。",
      };
    }
  }

  if (action === "skip") {
    // 闸门的全部意义就是不可绕过：失败也不许用「跳过」绕过去
    if (failed.step.kind === "gate") {
      return {
        ok: false,
        code: "GATE_CANNOT_SKIP",
        status: 409,
        message: "人工闸门不能跳过。要么修好导致失败的原因后重试，要么驳回这条运行。",
      };
    }
    if (note.trim().length < 4) {
      return {
        ok: false,
        code: "RESUME_NOTE_REQUIRED",
        status: 400,
        message: "跳过必须写明原因（至少 4 个字），否则事后看不出这一步为什么没有产出。",
      };
    }
  }

  return { ok: true, failed };
}

/**
 * 重试一个失败节点：状态回到 pending，让它被重新执行。
 * 保留 taskId / runId / recordId —— 重试要接在上次旁边，而不是另起一份重复记录。
 */
export function prepareRetry(state: StepState): StepState {
  const now = new Date().toISOString();
  return {
    status: "pending",
    attempts: attemptCount(state) + 1,
    ...(state.taskId ? { taskId: state.taskId } : {}),
    ...(state.runId ? { runId: state.runId } : {}),
    ...(state.recordId ? { recordId: state.recordId } : {}),
    ...(state.note ? { lastError: { message: state.note, at: state.finishedAt ?? now } } : {}),
  };
}

/** 跳过失败节点：标 skipped 并写清原因，原失败信息留在 lastError 里备查 */
export function prepareSkip(step: WorkflowStep, state: StepState, reason: string): StepState {
  const now = new Date().toISOString();
  const { note, ...rest } = state;
  return {
    ...rest,
    status: "skipped",
    attempts: attemptCount(state),
    reason: `人工跳过：${reason.trim()}（原失败：${note || "未记录原因"}）`,
    ...(note ? { lastError: { message: note, at: state.finishedAt ?? now } } : {}),
    finishedAt: now,
  };
}

/** 追加一条续跑记录，最多留 20 条，够看清一条运行被续过几次 */
export function appendResume(ctx: WorkflowContext, record: ResumeRecord): ResumeRecord[] {
  return [...(ctx.resumes ?? []), record].slice(-20);
}
