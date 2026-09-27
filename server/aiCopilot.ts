import type { AppState } from "./store.ts";
import {
  COPILOT_TOOL_DEFINITIONS,
  executeCopilotTool,
  inferCopilotTool,
  type CopilotContext,
  type CopilotToolName,
  type CopilotToolResult,
} from "../src/utils/copilotTools.ts";

export type CopilotMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
};

export type CopilotEvent =
  | { type: "status"; message: string }
  | { type: "tool_start"; toolName: CopilotToolName; label: string; args?: Record<string, unknown> }
  | { type: "tool_result"; result: CopilotToolResult }
  | { type: "text_delta"; text: string }
  | { type: "done"; source: "rules" | "model"; model?: string }
  | { type: "error"; message: string };

type Emit = (event: CopilotEvent) => void;

const toolLabel = new Map(COPILOT_TOOL_DEFINITIONS.map(tool => [tool.name, tool.label]));

function providerConfig() {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/$/, "");
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) return null;
  return { apiKey, baseUrl, model };
}

function compactContext(context: CopilotContext) {
  return {
    page: context.currentTabLabel || context.currentTab,
    tab: context.currentTab,
    user: context.currentUser || "当前用户",
    selectedInventoryId: context.selectedInventoryId,
    selectedCustomerId: context.selectedCustomerId,
    selectedDocumentNo: context.selectedDocumentNo,
    filters: context.filters,
  };
}

function systemPrompt(context: CopilotContext) {
  return [
    "你是 OneERP Copilot，不是闲聊机器人。你的首要目标是调用 ERP 工具并返回结构化结果。",
    "回答要简短、直接、可执行；库存、客户、利润、资金等查询优先调用工具，不要先说‘好的我马上处理’。",
    "创建客户、报价、采购单、销售单只能生成草稿并要求人工确认，禁止绕过确认直接写入。",
    "不得编造数据；只能引用工具返回的结果。不得在没有工具结果时声称已完成业务操作。",
    `当前 ERP 上下文：${JSON.stringify(compactContext(context))}`,
  ].join("\n");
}

function toOpenAiTools() {
  return COPILOT_TOOL_DEFINITIONS.map(tool => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
}

function lastUserPrompt(messages: CopilotMessage[]) {
  return [...messages].reverse().find(message => message.role === "user")?.content?.trim() || "";
}

function localReply(result: CopilotToolResult) {
  if (result.type === "error") return result.error || "工具执行失败。";
  if (result.type === "approval") return `${result.title}。${result.summary || "请先检查草稿内容，再确认执行。"}`;
  if (result.type === "empty") return result.summary || "没有找到匹配数据。";
  return result.summary || `已完成${result.title}。`;
}

function emitText(text: string, emit: Emit) {
  const chunks = text.match(/.{1,24}/gu) || [text];
  chunks.forEach(chunk => emit({ type: "text_delta", text: chunk }));
}

function resultForModel(result: CopilotToolResult): CopilotToolResult {
  // Keep the interactive card useful in the browser, but do not send personal
  // phone/WeChat fields to an external model provider.
  if (result.toolName !== "searchCustomer" || !result.rows) return result;
  return { ...result, rows: result.rows.map(row => { const { contact: _contact, phone: _phone, wechat: _wechat, ...safeRow } = row; return safeRow; }) };
}

function toProviderMessages(messages: CopilotMessage[], context: CopilotContext) {
  return [{ role: "system", content: systemPrompt(context) }, ...messages.slice(-16).map(message => ({ role: message.role, content: message.content, ...(message.toolName ? { name: message.toolName } : {}) }))];
}

async function askProvider(config: NonNullable<ReturnType<typeof providerConfig>>, messages: unknown[], includeTools: boolean) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, temperature: 0.15, max_tokens: 1200, messages, ...(includeTools ? { tools: toOpenAiTools(), tool_choice: "auto" } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(`AI 服务 HTTP ${response.status}: ${body?.error?.message || "请求失败"}`);
  return body?.choices?.[0]?.message || {};
}

/**
 * Stream only the final natural-language answer. Tool selection stays on a
 * regular request so the server can validate and execute every call before
 * any user-facing summary is emitted.
 */
async function streamProviderAnswer(config: NonNullable<ReturnType<typeof providerConfig>>, messages: unknown[], emit: Emit) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, temperature: 0.15, max_tokens: 1200, stream: true, messages }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(`AI 服务 HTTP ${response.status}: ${body?.error?.message || "请求失败"}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!response.body || !contentType.includes("text/event-stream")) {
    const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }> } | null;
    return { content: body?.choices?.[0]?.message?.content || "", streamed: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const flush = (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    frames.forEach(frame => {
      const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") return;
      try {
        const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = payload.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          content += delta;
          emit({ type: "text_delta", text: delta });
        }
      } catch {
        // Providers occasionally include keep-alive/comment frames; ignore them.
      }
    });
  };
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    flush(decoder.decode(next.value, { stream: true }));
  }
  flush(decoder.decode());
  return { content, streamed: true };
}

async function runWithProvider(config: NonNullable<ReturnType<typeof providerConfig>>, messages: CopilotMessage[], context: CopilotContext, state: AppState, emit: Emit) {
  emit({ type: "status", message: "正在读取 ERP 上下文" });
  const first = await askProvider(config, toProviderMessages(messages, context), true);
  const toolCalls = first.tool_calls || [];
  if (!toolCalls.length) {
    emitText(first.content || "我暂时没有足够信息完成这次判断。请尝试使用 /inventory、/report 或 /profit。", emit);
    emit({ type: "done", source: "model", model: config.model });
    return;
  }

  const providerMessages: unknown[] = [...toProviderMessages(messages, context), { role: "assistant", content: first.content || null, tool_calls: toolCalls }];
  for (const call of toolCalls.slice(0, 4)) {
    const name = call.function?.name as CopilotToolName;
    const definition = COPILOT_TOOL_DEFINITIONS.find(tool => tool.name === name);
    if (!definition) continue;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
    emit({ type: "tool_start", toolName: name, label: definition.label, args });
    const result = executeCopilotTool(name, state, args);
    emit({ type: "tool_result", result });
    providerMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(resultForModel(result)) });
  }
  emit({ type: "status", message: "正在整理结果" });
  const final = await streamProviderAnswer(config, providerMessages, emit);
  if (!final.streamed) emitText(final.content || "已完成工具查询，结果已展示在下方。", emit);
  emit({ type: "done", source: "model", model: config.model });
}

export async function runCopilotTurn(input: { messages: CopilotMessage[]; context: CopilotContext }, state: AppState, emit: Emit) {
  const config = providerConfig();
  if (config) {
    try {
      await runWithProvider(config, input.messages, input.context, state, emit);
      return;
    } catch (error) {
      emit({ type: "status", message: "模型暂不可用，已切换到本地 ERP 工具" });
      console.warn("[copilot] provider failed, fallback to rules", error instanceof Error ? error.message : error);
    }
  }

  const prompt = lastUserPrompt(input.messages);
  const inferred = inferCopilotTool(prompt);
  if (!inferred) {
    emitText("我是 OneERP Copilot。你可以直接说‘分析库存超过45天的商品’、‘查看今日经营’、‘分析本月利润’，也可以使用 /inventory、/customer、/report、/quote、/purchase、/sales。", emit);
    emit({ type: "done", source: "rules" });
    return;
  }
  const definition = COPILOT_TOOL_DEFINITIONS.find(tool => tool.name === inferred.name);
  emit({ type: "status", message: `正在执行${definition?.label || inferred.name}` });
  emit({ type: "tool_start", toolName: inferred.name, label: toolLabel.get(inferred.name) || inferred.name, args: inferred.args });
  const result = executeCopilotTool(inferred.name, state, inferred.args);
  emit({ type: "tool_result", result });
  emitText(localReply(result), emit);
  emit({ type: "done", source: "rules" });
}
