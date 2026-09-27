import {useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent} from "react";
import {useNavigate, useRouterState} from "@tanstack/react-router";
import {Bot, Check, ChevronRight, CircleAlert, LoaderCircle, Send, Sparkles, X} from "lucide-react";
import {notify} from "@/src/utils/notification";
import {Dialog, Button, Textarea, Badge} from "@/src/components/ui";
import {useAuth} from "@/src/app/auth";
import {navigationPathById, isNavigationItemActive, navigationItems} from "@/src/config/navigation";
import {aiApi, type CopilotMessage, type CopilotStreamEvent, type CopilotToolResult} from "@/src/services/api/endpoints/ai";
import {ApiError} from "@/src/services/api/client";
import {useUiStore} from "@/src/stores";

type ToolRun = {id: string; toolName: string; label: string; status: "running" | "done"};
type ChatMessage = {id: string; role: "user" | "assistant"; content: string; toolRuns?: ToolRun[]; toolResults?: CopilotToolResult[]; source?: "rules" | "model"; model?: string; error?: string};
const suggestedPrompts = ["分析库存超过45天的商品", "查看今日经营情况", "分析本月利润"];

function newId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function displayValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.join("、");
  return "—";
}
function ToolResultCard({result, onAction}: {result: CopilotToolResult; onAction: (result: CopilotToolResult, action: NonNullable<CopilotToolResult["actions"]>[number]) => void}) {
  const rows = result.rows?.slice(0, 6) || [];
  return <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3" aria-label={result.title}>
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-xs font-semibold text-[var(--erp-color-text)]">{result.title}</h3>{result.summary ? <p className="mt-1 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{result.summary}</p> : null}</div>{result.type === "error" ? <CircleAlert className="h-4 w-4 shrink-0 text-[var(--erp-color-danger)]" /> : <Check className="h-4 w-4 shrink-0 text-[var(--erp-color-success)]" />}</div>
    {rows.length ? <div className="mt-3 divide-y divide-[var(--erp-color-border)] rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]">{rows.map((row, index) => { const entries = Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== "").slice(0, 3); return <div key={`${result.id}-row-${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] gap-x-3 gap-y-0.5 px-2.5 py-2 text-xs"><span className="min-w-0 break-words font-medium text-[var(--erp-color-text)]">{displayValue(entries[0]?.[1])}</span><span className="min-w-0 max-w-[45%] break-words text-right text-[var(--erp-color-text-secondary)]">{displayValue(entries[1]?.[1])}</span>{entries[2] ? <span className="col-span-2 break-words text-xs text-[var(--erp-color-text-muted)]">{displayValue(entries[2][1])}</span> : null}</div>; })}{result.rows && result.rows.length > rows.length ? <p className="border-t border-[var(--erp-color-border)] px-2.5 py-1.5 text-xs text-[var(--erp-color-text-muted)]">还有 {result.rows.length - rows.length} 条，打开对应模块查看全部</p> : null}</div> : null}
    {result.error ? <p className="mt-2 text-xs text-[var(--erp-color-danger)]">{result.error}</p> : null}
    {result.actions?.length ? <div className="mt-3 flex flex-wrap gap-2">{result.actions.map((action) => <Button key={`${result.id}-${action.label}`} type="button" size="sm" variant={action.kind === "confirm" ? "secondary" : "primary"} onClick={() => onAction(result, action)}>{action.label}<ChevronRight className="h-3 w-3" /></Button>)}</div> : null}
  </section>;
}

function AssistantMessage({message, onAction}: {message: ChatMessage; onAction: (result: CopilotToolResult, action: NonNullable<CopilotToolResult["actions"]>[number]) => void}) {
  return <div className="flex items-start gap-2.5"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><Bot className="h-4 w-4" /></span><div className="min-w-0 flex-1 space-y-2">{message.content ? <div className="whitespace-pre-wrap rounded-[var(--erp-radius-lg)] rounded-tl-sm bg-[var(--erp-color-surface-muted)] px-3 py-2.5 text-sm leading-6 text-[var(--erp-color-text)]">{message.content}</div> : null}{message.toolRuns?.length ? <div className="space-y-1.5">{message.toolRuns.map((run) => <div key={run.id} className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)]">{run.status === "running" ? <LoaderCircle className="h-3 w-3 animate-spin text-[var(--erp-color-primary)]" /> : <Check className="h-3 w-3 text-[var(--erp-color-success)]" />}</span>{run.label}</div>)}</div> : null}{message.toolResults?.map((result) => <ToolResultCard key={result.id} result={result} onAction={onAction} />)}{message.error ? <div role="alert" className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-danger)]/20 bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-danger)]">{message.error}</div> : null}{message.source ? <p className="text-xs text-[var(--erp-color-text-muted)]">{message.source === "model" ? `DeepSeek${message.model ? ` · ${message.model}` : ""}` : "ERP 规则引擎"}</p> : null}</div></div>;
}

export function ErpAiDrawer() {
  const open = useUiStore((state) => state.aiDrawerOpen);
  const setOpen = useUiStore((state) => state.setAiDrawerOpen);
  const {session} = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentItem = useMemo(() => navigationItems.find((item) => isNavigationItemActive(item, pathname)), [pathname]);
  const context = useMemo(() => ({currentTab: currentItem?.id || pathname, currentTabLabel: currentItem?.label, currentUser: session?.user.displayName}), [currentItem?.id, currentItem?.label, pathname, session?.user.displayName]);

  useEffect(() => { if (open) messagesEndRef.current?.scrollIntoView({behavior: "smooth", block: "nearest"}); }, [messages, open]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const updateAssistant = (id: string, update: (message: ChatMessage) => ChatMessage) => setMessages((current) => current.map((message) => message.id === id ? update(message) : message));
  const handleEvent = (assistantId: string, event: CopilotStreamEvent) => {
    if (event.type === "status") { updateAssistant(assistantId, (message) => ({...message, content: message.content || event.message})); return; }
    if (event.type === "tool_start") { updateAssistant(assistantId, (message) => ({...message, toolRuns: [...(message.toolRuns || []), {id: newId("tool"), toolName: event.toolName, label: event.label, status: "running"}]})); return; }
    if (event.type === "tool_result") { updateAssistant(assistantId, (message) => ({...message, toolRuns: (message.toolRuns || []).map((run) => run.toolName === event.result.toolName ? {...run, status: "done"} : run), toolResults: [...(message.toolResults || []), event.result]})); return; }
    if (event.type === "text_delta") { updateAssistant(assistantId, (message) => ({...message, content: message.content === "正在读取 ERP 数据…" ? event.text : `${message.content}${event.text}`})); return; }
    if (event.type === "done") { updateAssistant(assistantId, (message) => ({...message, source: event.source, model: event.model})); return; }
    updateAssistant(assistantId, (message) => ({...message, error: event.message, content: message.content || "这次请求没有完成。"}));
  };
  const submit = async (event?: FormEvent<HTMLFormElement>, prompt?: string) => {
    event?.preventDefault();
    const content = (prompt ?? input).trim();
    if (!content || streaming) return;
    const userMessage: ChatMessage = {id: newId("user"), role: "user", content};
    const assistantId = newId("assistant");
    const assistantMessage: ChatMessage = {id: assistantId, role: "assistant", content: ""};
    const history: CopilotMessage[] = [...messages, userMessage].map((message) => ({role: message.role, content: message.content})).filter((message) => message.content);
    setMessages((current) => [...current, userMessage, assistantMessage]); setInput(""); setStreaming(true);
    const controller = new AbortController(); controllerRef.current = controller;
    try { await aiApi.streamCopilot({messages: history, context}, (next) => handleEvent(assistantId, next), controller.signal); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; const message = error instanceof ApiError && error.isForbidden ? "当前账号没有使用 AI 助手的权限。" : error instanceof Error ? error.message : "AI 助手暂时不可用，请稍后重试。"; updateAssistant(assistantId, (current) => ({...current, error: message, content: current.content || "这次请求没有完成。"})); }
    finally { if (controllerRef.current === controller) controllerRef.current = null; setStreaming(false); }
  };
  const handleOpenChange = (next: boolean) => { if (!next) controllerRef.current?.abort(); setOpen(next); };
  const handleAction = (result: CopilotToolResult, action: NonNullable<CopilotToolResult["actions"]>[number]) => { if (action.kind === "confirm") { notify.info("AI 只生成业务草稿，请在对应业务页面检查后手动提交。", {description: result.title}); return; } if (!action.tab) return; void navigate({to: navigationPathById(action.tab)}); setOpen(false); };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } };

  return <Dialog.Root open={open} onOpenChange={handleOpenChange}><Dialog.Portal><Dialog.Backdrop className="erp-drawer-backdrop-layer erp-drawer-backdrop fixed inset-x-0 bottom-0 bg-[var(--erp-color-backdrop)] backdrop-blur-[2px]" /><Dialog.Viewport className="erp-drawer-layer erp-drawer-viewport fixed inset-x-0 bottom-0 flex justify-end"><Dialog.Popup className="flex h-full max-h-full w-full max-w-xl min-h-0 flex-col border-l border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--erp-color-border)] px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><Sparkles className="h-4 w-4" /></span><div className="min-w-0"><Dialog.Title className="truncate text-sm font-semibold">AI 助手</Dialog.Title><Dialog.Description className="truncate text-xs text-[var(--erp-color-text-muted)]">基于当前页面上下文查询库存、客户、利润与资金</Dialog.Description></div></div><Dialog.Close render={<Button size="icon" variant="ghost" aria-label="关闭 AI 助手"><X className="h-4 w-4" /></Button>} /></div>
    <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{messages.length === 0 ? <div className="flex min-h-full flex-col items-center justify-center py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><Bot className="h-6 w-6" /></span><h2 className="mt-4 text-sm font-semibold">今天想先看什么？</h2><p className="mt-1 max-w-xs text-xs leading-5 text-[var(--erp-color-text-secondary)]">我会调用真实 ERP 数据，结果会标注来源；涉及写入时只生成草稿，不会直接改动业务数据。</p><div className="mt-5 flex max-w-sm flex-wrap justify-center gap-2">{suggestedPrompts.map((prompt) => <Button key={prompt} type="button" size="sm" variant="secondary" onClick={() => void submit(undefined, prompt)}>{prompt}</Button>)}</div></div> : <div className="space-y-4">{messages.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end"><div className="max-w-[88%] whitespace-pre-wrap rounded-[var(--erp-radius-lg)] rounded-tr-sm bg-[var(--erp-color-primary)] px-3 py-2.5 text-sm leading-6 text-white">{message.content}</div></div> : <AssistantMessage key={message.id} message={message} onAction={handleAction} />)}<div ref={messagesEndRef} /></div>}</div>
    <div className="shrink-0 border-t border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3 sm:p-4"><form onSubmit={(event) => void submit(event)}><div className="relative"><Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} rows={2} maxLength={6000} disabled={streaming} placeholder="问问库存、客户、利润或资金…" aria-label="发送给 AI 助手" className="min-h-20 resize-none pr-12 text-sm" /><Button type="submit" size="icon" variant="primary" disabled={!input.trim() || streaming} aria-label="发送" className="absolute bottom-2 right-2">{streaming ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></div><div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[var(--erp-color-text-muted)]"><span>{streaming ? "正在读取 ERP 数据…" : "Enter 发送 · Shift + Enter 换行"}</span><Badge className="bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-muted)]">{input.length}/6000</Badge></div></form></div>
  </Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}
