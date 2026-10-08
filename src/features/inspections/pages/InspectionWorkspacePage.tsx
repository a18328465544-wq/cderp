import {zodResolver} from "@hookform/resolvers/zod";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Activity, ArrowLeft, Camera, CheckCircle2, ChevronRight, Flame, PackageCheck, Pencil, SlidersHorizontal, Wrench} from "lucide-react";
import {Controller, useForm, type Path, type UseFormReturn} from "react-hook-form";
import {useCallback, useEffect, useMemo, useRef, useState, type FormEventHandler, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Badge, Button, Card, Input, Select, Textarea} from "@/src/components/ui";
import {ErpCheckboxField, ErpDatePicker, ErpEmptyState, ErpField, ErpImagePreviewDialog, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageFrame, ErpPageHeader, ErpSearchInput, ErpUploader, useErpDirtyGuard, useErpUnsavedChangesGuard} from "@/src/components/common";
import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {useDraftMediaUpload} from "@/src/components/common/useDraftMediaUpload";
import {IMAGE_MAX_COUNT} from "@/src/lib/media/image-compression";
import {ApiError, inspectionApi, queryKeys, refreshErpAfterDocument, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity, useWorkspaceTabDirty} from "@/src/hooks/useWorkspaceTabRuntime";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import type {InspectionCandidate, InspectionFormValues, InspectionHistoryItem} from "@/src/types/inspection";
import {createInspectionDefaults, createInspectionHistoryDefaults} from "../inspection.defaults";
import {inspectionConditionOptions, inspectionResultOptions, inspectionSchema} from "../inspection.schema";
import {InspectionSnCameraDialog} from "../components/InspectionSnCameraDialog";
import {ErpMobileWorkflow, ErpMobileWorkflowSection} from "@/src/components/common";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {hasWorkflowErrors} from "@/src/components/common/mobileWorkflowValidation";
import {navigationItems} from "@/src/config/navigation";
import {createInspectionAttempt, isCurrentInspectionAttempt, sameInspectionForm, snapshotInspectionForm, type InspectionAttempt, type InspectionDraftScope} from "../inspection.attempt";

function useInspectionMediaUpload(onUrlsChange: (urls: string[]) => void, maxCount = IMAGE_MAX_COUNT) {
  return useDraftMediaUpload({entityType: "inspection_draft", draftPrefix: "inspection-draft", relationRole: "inspection-evidence", existingName: "检测图片", onUrlsChange, maxCount});
}

function useInventorySelectionUrlState() {
  return useUrlSearchState({
    defaultValue: "",
    parse: (search: string) => new URLSearchParams(search).get("inventory") || "",
    serialize: (inventoryId: string) => {
      const params = new URLSearchParams();
      if (inventoryId) params.set("inventory", inventoryId);
      return params;
    },
  });
}

export function InspectionWorkspacePage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const allowed = createCapabilities(session).menu("inspections");
  const workspaceQuery = useQuery({queryKey: queryKeys.inspections.workspace(session?.user.id || "anonymous"), queryFn: ({signal}) => inspectionApi.workspace(signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证检测质检权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有检测质检权限" description="服务器已拒绝 inspections 菜单访问，请联系管理员授权。" />;
  return <InspectionWorkspaceContent session={session} query={workspaceQuery} onAuthExpired={logout} />;
}

function InspectionWorkspaceContent({session, query, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inspectionApi.workspace>>>>; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const canEditHistory = session.permissions.canEditHistory;
  const {value: selectedId, commit: setSelectedId} = useInventorySelectionUrlState();
  const [editingHistory, setEditingHistory] = useState<InspectionHistoryItem | null>(null);
  const [cameraScope, setCameraScope] = useState<InspectionDraftScope | null>(null);
  const mobile = useInspectionMobile();
  const {active} = useWorkspaceTabActivity();
  const [showMobileList, setShowMobileList] = useState(!selectedId);
  const [completedInventoryId, setCompletedInventoryId] = useState("");
  const form = useForm<InspectionFormValues>({resolver: zodResolver(inspectionSchema), defaultValues: createInspectionDefaults(null, session.user.displayName), mode: "onSubmit"});
  const scopeRef = useRef<InspectionDraftScope>({inventoryId: ""});
  const inFlight = useRef<InspectionAttempt | null>(null);
  const deferredCompletion = useRef<InspectionAttempt | null>(null);
  const mounted = useRef(true);
  const latestActive = useRef(active);
  latestActive.current = active;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      deferredCompletion.current = null;
    };
  }, []);
  const {formState} = form;
  const formValues = form.watch();
  useErpDirtyGuard(formState.isDirty);
  useWorkspaceTabDirty("inspections", formState.isDirty);
  const unsavedChanges = useErpUnsavedChangesGuard(formState.isDirty);
  const syncImageUrls = useCallback((urls: string[]) => form.setValue("images", urls, {shouldDirty: true, shouldValidate: true}), [form]);
  const media = useInspectionMediaUpload(syncImageUrls);
  const candidates = query.data?.candidates || [];
  const history = query.data?.history || [];
  const pendingGpus = useMemo(() => candidates.filter((item) => item.isGpu), [candidates]);
  const pendingAccessories = useMemo(() => candidates.filter((item) => !item.isGpu), [candidates]);
  // Workspace tabs intentionally drop transient inventory URL parameters.
  // The mounted form still owns its draft; an empty URL must not hide it.
  const formInventoryId = form.watch("inventoryId");
  // A URL change must not relabel A's registered fields as item B. The current
  // editor remains its own source until it is explicitly reset or saved.
  const activeInventoryId = formInventoryId || selectedId;
  const selectedCandidate = useMemo(() => editingHistory?.candidate || candidates.find((item) => item.id === activeInventoryId) || null, [activeInventoryId, candidates, editingHistory]);
  usePhoneBackLayer(active && mobile && Boolean(selectedCandidate) && !showMobileList, () => {if (!inFlight.current) setShowMobileList(true);}, 50);
  const serialNumber = form.watch("serialNumber");
  const duplicateOwner = useMemo(() => {
    const normalized = serialNumber.trim().toLocaleLowerCase("zh-CN");
    if (!normalized || !selectedCandidate) return null;
    const candidate = candidates.find((item) => item.id !== selectedCandidate.id && item.serialNumber.trim().toLocaleLowerCase("zh-CN") === normalized);
    if (candidate) return `${candidate.id} / ${candidate.productName}`;
    const archived = history.find((item) => item.inventoryId !== selectedCandidate.id && item.serialNumber.trim().toLocaleLowerCase("zh-CN") === normalized);
    return archived ? `${archived.inventoryId} / ${archived.productName}` : null;
  }, [candidates, history, selectedCandidate, serialNumber]);

  const selectCandidate = useCallback((candidate: InspectionCandidate) => {
    if (form.getValues("inventoryId") === candidate.id && !editingHistory) {
      if (selectedId !== candidate.id) setSelectedId(candidate.id);
      setShowMobileList(false);
      return;
    }
    const applySelection = () => {
      scopeRef.current = {inventoryId: candidate.id};
      deferredCompletion.current = null;
      setCameraScope(null);
      setShowMobileList(false);
      setCompletedInventoryId("");
      setEditingHistory(null);
      setSelectedId(candidate.id);
      media.reset([]);
      form.reset(createInspectionDefaults(candidate, session.user.displayName));
    };
    unsavedChanges.requestLeave(applySelection);
  }, [editingHistory, form, media, selectedId, session.user.displayName, unsavedChanges.requestLeave]);
  const editInspection = useCallback((item: InspectionHistoryItem) => {
    unsavedChanges.requestLeave(() => {
      scopeRef.current = {inventoryId: item.inventoryId};
      deferredCompletion.current = null;
      setCameraScope(null);
      setShowMobileList(false);
      setCompletedInventoryId("");
      setEditingHistory(item);
      setSelectedId(item.inventoryId);
      media.reset(item.images);
      form.reset(createInspectionHistoryDefaults(item, session.user.displayName));
    });
  }, [form, media, session.user.displayName, unsavedChanges.requestLeave]);
  useEffect(() => {
    if (!active || !selectedCandidate || form.getValues("inventoryId")) return;
    const currentUrlId = new URLSearchParams(window.location.search).get("inventory");
    if (currentUrlId && currentUrlId !== selectedCandidate.id) return;
    scopeRef.current = {inventoryId: selectedCandidate.id};
    form.reset(createInspectionDefaults(selectedCandidate, session.user.displayName));
  }, [active, form, selectedCandidate, session.user.displayName]);
  const clearSavedInspection = useCallback((attempt: InspectionAttempt) => {
    scopeRef.current = {inventoryId: ""};
    deferredCompletion.current = null;
    setCameraScope(null);
    const currentUrlId = new URLSearchParams(window.location.search).get("inventory");
    const remaining = candidates.filter((item) => item.id !== attempt.values.inventoryId);
    const next = remaining[0];
    if (mobile && !attempt.inspectionId && next) {
      setSelectedId(next.id);
      setShowMobileList(false);
      setCompletedInventoryId(attempt.values.inventoryId);
      setEditingHistory(null);
      media.reset([]);
      scopeRef.current = {inventoryId: next.id};
      form.reset(createInspectionDefaults(next, session.user.displayName));
      return;
    }
    // A newer deep link on this Tab also owns its selection. Finishing A may
    // clear A's saved fields, but must leave B's requested URL intact.
    if (!currentUrlId || currentUrlId === attempt.values.inventoryId) setSelectedId("");
    setShowMobileList(!currentUrlId || currentUrlId === attempt.values.inventoryId);
    setCompletedInventoryId(attempt.values.inventoryId);
    setEditingHistory(null);
    media.reset([]);
    form.reset(createInspectionDefaults(null, session.user.displayName));
  }, [candidates, form, media, mobile, session.user.displayName, setSelectedId]);
  useEffect(() => {
    const attempt = deferredCompletion.current;
    if (!active || !attempt) return;
    deferredCompletion.current = null;
    if (isCurrentInspectionAttempt(attempt, scopeRef.current, form.getValues())) clearSavedInspection(attempt);
  }, [active, clearSavedInspection, form, selectedId]);
  const closeInspection = useCallback(() => {
    unsavedChanges.requestLeave(() => {
      scopeRef.current = {inventoryId: ""};
      deferredCompletion.current = null;
      setCameraScope(null);
      setSelectedId("");
      setShowMobileList(true);
      setEditingHistory(null);
      media.reset([]);
      form.reset(createInspectionDefaults(null, session.user.displayName));
    });
  }, [form, media, session.user.displayName, unsavedChanges.requestLeave]);
  const mutation = useMutation({
    mutationFn: ({values, inspectionId, expectedRecordVersion}: InspectionAttempt) => inspectionId
      ? inspectionApi.update(inspectionId, values, expectedRecordVersion ?? 1)
      : inspectionApi.create(values),
    onSuccess: async (result, variables) => {
      notify.success(variables.values.condition === "全新"
        ? `${result.id || "检测记录"} 已完成全新快速入库，SN 已同步`
        : `${result.id || "检测记录"} 已提交，SN、成色、带盒、保修期和最终库位已同步`);
      if (mounted.current && isCurrentInspectionAttempt(variables, scopeRef.current, form.getValues())) {
        unsavedChanges.markSaved();
        if (latestActive.current) clearSavedInspection(variables);
        else {
          // Never write another Tab's URL. Keep the saved editor clean until
          // its own Tab becomes active, then reconcile the completed selection.
          form.reset(form.getValues());
          deferredCompletion.current = variables;
        }
      }
      if (variables.inspectionId) {
        await invalidateErpDomains(queryClient, ["inspections", "inventory", "state"]);
      } else {
        await refreshErpAfterDocument(queryClient, ["state","inspections","inventory","products","purchase"]);
      }
    },
    onError: (error, attempt) => {
      if (error instanceof ApiError && error.isUnauthorized) {
        onAuthExpired();
        return;
      }
      const message = error instanceof Error && error.message ? error.message : "检测质检提交失败，请稍后重试";
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      notify.error(message, {description: `库存 ${attempt.values.inventoryId}${requestId ? ` · 请求 ID：${requestId}` : " · 请检查网络连接或稍后重试"}`});
    },
    onSettled: (_result, _error, attempt) => {if (inFlight.current === attempt) inFlight.current = null;},
  });
  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (!active || inFlight.current) return;
    const scope = scopeRef.current;
    const raw = snapshotInspectionForm(form.getValues());
    const record = editingHistory && {id: editingHistory.id, recordVersion: editingHistory.recordVersion};
    return form.handleSubmit(
      (values) => {
        // The resolver is asynchronous too: selection may change before it returns.
        if (!mounted.current || !latestActive.current || inFlight.current || scopeRef.current !== scope || !sameInspectionForm(raw, form.getValues())) return;
        if (media.isBlocking()) {notify.error("仍有图片正在上传或上传失败，请完成处理后再提交检测单"); return;}
        if (duplicateOwner) {notify.error(`SN 已存在，不能重复入库：${duplicateOwner}`); return;}
        if (selectedCandidate?.id !== values.inventoryId) {notify.error("当前表单与所选库存不一致，请重新选择商品"); return;}
        const attempt = createInspectionAttempt(scope, values, raw, record);
        inFlight.current = attempt;
        setCameraScope(null);
        mutation.mutate(attempt);
      },
      (errors) => {
        if (!mounted.current || !latestActive.current || scopeRef.current !== scope || !sameInspectionForm(raw, form.getValues())) return;
        const fields = Object.keys(errors);
        const firstField = fields[0] as Path<InspectionFormValues> | undefined;
        // Let error-bearing mobile groups open before moving focus into them.
        if (firstField) requestAnimationFrame(() => {
          if (!mounted.current || !latestActive.current || scopeRef.current !== scope || !sameInspectionForm(raw, form.getValues())) return;
          form.setFocus(firstField);
          if (mobile && document.activeElement instanceof HTMLElement) document.activeElement.scrollIntoView({block: "center"});
        });
        notify.error(`请先补充检测表单中的 ${fields.length || 1} 项必填内容`, {description: "具体错误已标注在对应字段下方"});
      },
    )(event);
  };
  const handleSnDetected = useCallback((code: string) => {
    if (cameraScope !== scopeRef.current || inFlight.current?.scope === scopeRef.current) return;
    form.setValue("serialNumber", code, {shouldDirty: true, shouldValidate: true});
  }, [cameraScope, form]);
  const draftPending = mutation.isPending && mutation.variables?.scope === scopeRef.current;
  const mutationMessage = isCurrentInspectionAttempt(mutation.variables, scopeRef.current, formValues) && mutation.error instanceof Error ? mutation.error.message : "";
  const mobilePageRef = useRef<HTMLDivElement>(null);
  const lastMobileView = useRef("");
  useEffect(() => {
    const view = `${activeInventoryId}:${showMobileList}`;
    if (!mobile || !active || lastMobileView.current === view) return;
    lastMobileView.current = view;
    mobilePageRef.current?.closest("main")?.scrollTo({top: 0});
  }, [active, activeInventoryId, mobile, showMobileList]);

  return <ErpPageFrame density="compact" className={`erp-inspection-page ${mobile && selectedCandidate && !showMobileList ? "erp-inspection-mobile-editing" : ""}`}>
    <ErpPageHeader
      title={mobile ? navigationItems.find((item) => item.id === "inspections")?.mobileLabel || "检测质检" : "检测质检"}
      density={mobile ? "compact" : "default"}
      subtitle={editingHistory ? `正在编辑入库检测单 ${editingHistory.id}，保存后回到检测归档列表。` : "全新商品只需录入 SN；二手显卡走完整检测，其他配件走简易检测。"}
      quickStatus={[{icon: <Wrench className="h-4 w-4" />, label: "当前待检", value: `${candidates.length} 件`, tone: candidates.length ? "warning" : "success", description: "显卡与其他配件待检总数"}]}
    />
    <ErpPageContent>
      <div ref={mobilePageRef} hidden />
      {mobile && !query.error && <div hidden={Boolean(selectedCandidate && !showMobileList)}><InspectionMobileQueue candidates={candidates} history={history} loading={query.isPending} canEditHistory={canEditHistory} onSelect={selectCandidate} onEdit={editInspection} resume={selectedCandidate} onResume={() => setShowMobileList(false)} completedInventoryId={completedInventoryId} refreshing={query.isFetching} /></div>}
      {query.error ? <ErpPageError title="检测质检数据加载失败" description={query.error.message} onRetry={() => void query.refetch()} /> : <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
      <div className="hidden space-y-3 md:block">
        <div className="space-y-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3">
          <h2 className="flex items-center justify-between border-b border-[var(--erp-color-border)] pb-2 text-sm font-semibold tracking-normal text-[var(--erp-color-text)]"><span className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-[var(--erp-color-primary)]" />显卡检测池 ({pendingGpus.length})</span><Badge className="rounded-[var(--erp-radius-xs)] px-1.5 py-0.5 text-xs" tone={pendingGpus.length ? "warning" : "success"}>待质检</Badge></h2>
          <div className="erp-scrollbar max-h-[240px] space-y-2 overflow-y-auto pr-1">{query.isPending ? <ErpLoadingState title="正在加载显卡检测池" /> : pendingGpus.length === 0 ? <ErpEmptyState title="显卡检测池已清空" description="所有待检测显卡均已完成质检。" /> : pendingGpus.map((candidate) => {const selected = activeInventoryId === candidate.id && !editingHistory; return <Button key={candidate.id} type="button" variant="ghost" onClick={() => selectCandidate(candidate)} className={`!h-auto w-full justify-between rounded-[var(--erp-radius-md)] border p-3 text-left ${selected ? "border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)]" : "border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]"}`}><span className="min-w-0 max-w-[210px] space-y-1"><span className={`block truncate text-xs font-semibold ${selected ? "text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text)]"}`}>{candidate.productName}</span><span className="block truncate text-xs font-normal text-[var(--erp-color-text-secondary)]">档案ID: <span className="erp-data-number">{candidate.id}</span> | SN: {candidate.serialNumber ? <span className="erp-data-number">{candidate.serialNumber}</span> : "待检测录入"}</span><span className="block truncate text-xs font-normal text-[var(--erp-color-text-secondary)]" title={`收购源：${candidate.supplierName || "未记录"}`}>收购源: {candidate.supplierName || "未记录"}</span><span className="block truncate text-xs font-normal text-[var(--erp-color-text-secondary)]" title={`经办人：${candidate.purchaseHandler || "未记录"}`}>经办人: {candidate.purchaseHandler || "未记录"}</span></span><span className="shrink-0 text-right"><span className="block text-xs text-[var(--erp-color-warning)]">待测状态</span><span className="mt-1 block text-xs font-normal text-[var(--erp-color-text-muted)]">入库天数: <span className="erp-data-number">{candidate.inventoryDays}</span>天</span><ChevronRight className="mt-1 inline-block h-4 w-4" /></span></Button>;})}</div>
        </div>

        <div className="space-y-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3">
          <h2 className="flex items-center justify-between border-b border-[var(--erp-color-border)] pb-2 text-sm font-semibold tracking-normal text-[var(--erp-color-text)]"><span className="flex items-center gap-1.5"><SlidersHorizontal className="h-4 w-4 text-[var(--erp-color-primary)]" />其他配件检测池子 ({pendingAccessories.length})</span><Badge className="rounded-[var(--erp-radius-xs)] px-1.5 py-0.5 text-xs" tone="info">简易检测</Badge></h2>
          <div className="erp-scrollbar max-h-[220px] space-y-2 overflow-y-auto pr-1">{query.isPending ? <ErpLoadingState title="正在加载配件检测池" /> : pendingAccessories.length === 0 ? <ErpEmptyState title="暂无待检测配件" description="CPU、主板、内存、硬盘、电源等会在这里确认 SN、成色、带盒和保修。" /> : pendingAccessories.map((candidate) => <Button key={candidate.id} type="button" variant="ghost" onClick={() => selectCandidate(candidate)} className={`!h-auto w-full justify-between rounded-[var(--erp-radius-md)] border p-3 text-left ${activeInventoryId === candidate.id && !editingHistory ? "border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)]" : "border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]"}`}><span className="min-w-0 max-w-[210px] space-y-1"><span className="block truncate text-xs font-semibold text-[var(--erp-color-text)]">{candidate.productName}</span><span className="block truncate text-xs font-normal text-[var(--erp-color-text-secondary)]">{candidate.category} | <span className="erp-data-number">{candidate.id}</span></span><span className="inline-block rounded-[var(--erp-radius-xs)] bg-[var(--erp-color-surface)] px-1.5 py-0.5 text-xs font-normal text-[var(--erp-color-text-secondary)]">SN: {candidate.serialNumber ? <span className="erp-data-number">{candidate.serialNumber}</span> : "待录入"}</span><span className="block truncate text-xs font-normal text-[var(--erp-color-text-secondary)]" title={`经办人：${candidate.purchaseHandler || "未记录"}`}>经办人: {candidate.purchaseHandler || "未记录"}</span></span><span className="shrink-0 text-right"><span className="block text-xs text-[var(--erp-color-primary)]">{candidate.status}</span><span className="mt-1 block max-w-24 truncate text-xs font-normal text-[var(--erp-color-text-muted)]">{candidate.warehouseLocation || "待检测区"}</span><ChevronRight className="mt-1 inline-block h-4 w-4" /></span></Button>)}</div>
        </div>

        <div className="space-y-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3">
          <div className="flex items-center justify-between border-b border-[var(--erp-color-border)] pb-2"><h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-normal text-[var(--erp-color-text)]"><CheckCircle2 className="h-4 w-4 text-[var(--erp-color-success)]" />已质检归档记录</h2><span className="text-xs text-[var(--erp-color-text-muted)]">{history.length} 次归档</span></div>
          <div className="erp-scrollbar max-h-[220px] space-y-2 overflow-y-auto pr-1">{query.isPending ? <ErpLoadingState title="正在加载检测归档" /> : history.length === 0 ? <ErpEmptyState title="暂无检测归档" description="完成检测后会在这里生成归档记录。" /> : history.map((item) => <div key={item.id} className={`rounded-[var(--erp-radius-md)] border p-2.5 text-xs ${editingHistory?.id === item.id ? "border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)]" : "border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]"}`}><div className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate font-semibold text-[var(--erp-color-text-secondary)]">SN: {item.serialNumber ? <span className="erp-data-number">{item.serialNumber}</span> : "未记录"}</span><div className="flex shrink-0 items-center gap-1"><Badge className="rounded-[var(--erp-radius-xs)] px-1.5 py-0.5 text-xs" tone={item.resultStatus === "通过" ? "success" : item.resultStatus === "轻微问题" ? "info" : "danger"}>{item.resultStatus}</Badge>{canEditHistory ? <Button type="button" size="icon" variant="ghost" className="!h-7 !w-7" onClick={() => editInspection(item)} aria-label={`编辑检测单 ${item.id}`} title="编辑入库检测单"><Pencil className="h-3 w-3" /></Button> : null}</div></div><div className="mt-1 line-clamp-2 text-xs text-[var(--erp-color-text-secondary)]">烤机: {item.furmarkResult || (item.category === "显卡" ? "未记录" : "其他配件简易检测")}</div><div className="mt-1 flex justify-between gap-2 text-xs text-[var(--erp-color-text-muted)]"><span>测试员: {item.inspector || "未记录"}</span><span className="erp-data-number">{item.inspectTime}</span></div></div>)}</div>
        </div>
      </div>

      <div className="min-w-0" hidden={mobile && (!selectedCandidate || showMobileList)}>{selectedCandidate ? <InspectionFormDrawer candidate={selectedCandidate} form={form} mobile={mobile} editing={Boolean(editingHistory)} remainingCount={candidates.filter((item) => item.id !== selectedCandidate.id).length} onBack={() => setShowMobileList(true)} onCancel={closeInspection} onOpenCamera={() => setCameraScope(scopeRef.current)} onSubmit={submit} submitting={mutation.isPending} draftPending={draftPending} errorMessage={mutationMessage} duplicateOwner={duplicateOwner} media={media} /> : <div className="space-y-3 rounded-[var(--erp-radius-md)] border border-dashed border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-6 py-10 text-center xl:min-h-[210px]"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)] erp-data-number text-xl font-semibold text-[var(--erp-color-primary)]">GPU-Z</div><div><p className="text-sm font-semibold text-[var(--erp-color-text)]">请从左侧选择显卡或其他配件进行检测录入</p><p className="mx-auto mt-1 max-w-[320px] text-xs leading-relaxed text-[var(--erp-color-text-secondary)]">全新商品只需录入 SN；二手显卡会加载完整检测项目。</p></div></div>}</div>
      </div>}
    </ErpPageContent>
    <InspectionSnCameraDialog open={Boolean(cameraScope && cameraScope === scopeRef.current)} onOpenChange={(open) => {if (!open) setCameraScope(null);}} onDetected={handleSnDetected} />
    {unsavedChanges.dialog}
  </ErpPageFrame>;
}

function InspectionFormDrawer({candidate, form, mobile, editing, remainingCount, onBack, onCancel, onOpenCamera, onSubmit, submitting, draftPending, errorMessage, duplicateOwner, media}: {candidate: InspectionCandidate; form: UseFormReturn<InspectionFormValues>; mobile: boolean; editing: boolean; remainingCount: number; onBack: () => void; onCancel: () => void; onOpenCamera: () => void; onSubmit: FormEventHandler<HTMLFormElement>; submitting: boolean; draftPending: boolean; errorMessage: string; duplicateOwner: string | null; media: ReturnType<typeof useInspectionMediaUpload>}) {
  const isGpu = form.watch("isGpu");
  const isBrandNew = form.watch("condition") === "全新";
  const temperature = form.watch("temperature");
  const validationErrorCount = Object.keys(form.formState.errors).length;
  const stepValidation = inspectionSchema.safeParse(form.watch());
  const stepIssues = stepValidation.success ? [] : stepValidation.error.issues;
  const testFields = ["exteriorCheck", "fanCheck", "portsCheck", "gpuzCheck", "furmarkResult", "threedMarkResult", "vramResult", "temperature", "wattage"];
  const errorFields = Object.keys(form.formState.errors);
  const errorStep = validationErrorCount ? errorFields.some((field) => ["serialNumber", "condition", "warrantyDate", "warehouseLocation"].includes(field)) ? 0 : errorFields.some((field) => testFields.includes(field)) ? 1 : 2 : undefined;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);
  const serialRegistration = form.register("serialNumber");
  const previewItem = media.items.find((item) => item.id === previewId);
  useEffect(() => {
    if (mobile) return;
    const frame = requestAnimationFrame(() => serialInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [candidate.id, editing, mobile]);
  return <>
    {mobile && <header className="erp-inspection-task-header"><Button type="button" variant="ghost" size="iconTouch" aria-label="返回入库待办" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button><div><h2>{editing ? "编辑检测单" : isBrandNew ? "确认入库" : "质检入库"}</h2><p>{isBrandNew ? "全新商品 · 录入 SN 即可" : isGpu ? "二手显卡 · 实测后入库" : "配件 · 简易检测"}</p></div></header>}
    <ErpMobileWorkflow resetKey={candidate.id} pending={draftPending} errorStep={isBrandNew || !isGpu ? undefined : errorStep} steps={isBrandNew || !isGpu ? [{label: "入库"}] : [
      {label: "SN", ready: !hasWorkflowErrors(stepIssues, ["serialNumber", "condition", "warrantyDate", "warehouseLocation"]) && !duplicateOwner, blockedReason: duplicateOwner ? "SN 已被占用，请重新核对" : "请录入 SN，并完善入库信息"},
      {label: "检测", ready: !hasWorkflowErrors(stepIssues, testFields), blockedReason: "请填写实际测试结果、温度和功耗"},
      {label: "确认"},
    ]}>
    <form noValidate onSubmit={onSubmit} className="erp-inspection-form relative space-y-4 overflow-clip rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4">
      <fieldset disabled={draftPending} className="min-w-0 space-y-4">
      <ErpMobileWorkflowSection step={0}>
      {mobile ? <section className="erp-inspection-phone-product" aria-label="本次入库商品"><ErpMobileRecordRow title={candidate.productName} icon={<PackageCheck className="h-5 w-5" />} subtitle={`经办人：${candidate.purchaseHandler || "未记录"}`} meta={candidate.supplierName || "来源未记录"} status={<Badge tone={isBrandNew ? "success" : "warning"}>{form.watch("condition")}</Badge>} /><details><summary className="erp-focus-ring">库存编号与物流</summary><p className="erp-data-number break-all">{candidate.id}{candidate.expressNo && <><br />快递：{candidate.expressNo}</>}</p></details></section> : <div className="erp-inspection-identity relative rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4">
        <span className="absolute right-3 top-3"><Badge className="rounded-[var(--erp-radius-xs)] px-2 py-0.5 text-xs font-semibold" tone={isBrandNew ? "success" : "info"}>{isBrandNew ? "全新快速入库" : isGpu ? "显卡完整检测" : "其他配件简易检测"}</Badge></span>
        <h3 className="pr-32 text-sm font-semibold text-[var(--erp-color-text)]">{candidate.productName}</h3>
        <div className="mt-2.5 grid grid-cols-1 gap-4 text-xs sm:grid-cols-3"><div><span className="block text-[var(--erp-color-text-muted)]">独立库存编号</span><span className="erp-data-number font-semibold text-[var(--erp-color-text-secondary)]">{candidate.id}</span></div><div><span className="block text-[var(--erp-color-text-muted)]">PCB物理序列号</span><span className="font-semibold text-[var(--erp-color-primary)]">{candidate.serialNumber ? <span className="erp-data-number">{candidate.serialNumber}</span> : "待检测录入"}</span></div><div><span className="block text-[var(--erp-color-text-muted)]">检测类型</span><span className="text-[var(--erp-color-text-secondary)]">{isBrandNew ? "全新快速入库" : isGpu ? "显卡检测入库" : "其他配件检测"}</span></div></div>
      </div>}

      <div className="erp-inspection-sn-grid rounded-[var(--erp-radius-md)] border border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)] p-4">
        <Field label={mobile ? "序列号 SN" : "入库 SN 录入"} error={form.formState.errors.serialNumber?.message}><div className="flex gap-2"><Input {...serialRegistration} aria-label="入库序列号" autoCapitalize="none" autoCorrect="off" spellCheck={false} ref={(element) => {serialRegistration.ref(element); serialInputRef.current = element;}} className={`erp-data-number placeholder:font-sans ${duplicateOwner ? "border-[var(--erp-color-danger)]" : ""}`} placeholder={!mobile && candidate.expressNo ? `快递 ${candidate.expressNo} 到货后录入实物SN` : "扫描或输入实物 SN"} /><Button type="button" size="icon" variant="primary" onClick={onOpenCamera} aria-label="调用摄像头扫码录入 SN"><Camera className="h-4 w-4" /></Button></div></Field>
        <div className="text-xs leading-relaxed text-[var(--erp-color-text-secondary)]">{mobile ? "请核对实物标签，避免重复入库。" : isBrandNew ? "全新商品只需录入实物 SN，无需烤机或跑分；质保与库位可在补充信息中调整。" : isGpu ? "显卡检测录入会写入 SN，并按检测结论更新为已入库、维修中或已退货。" : "其他配件只做简易检测：SN、成色、是否带盒、保修期，提交后写入库存档案。"}{!mobile && candidate.expressNo && <span className="mt-1 block text-[var(--erp-color-primary)]">关联快递单号：<span className="erp-data-number">{candidate.expressNo}</span></span>}{duplicateOwner && <span role="alert" className="mt-1 block font-semibold text-[var(--erp-color-danger)]">SN 已被 {duplicateOwner} 占用，请重新扫码或核对标签。</span>}</div>
      </div>

      <Field label="成色级别" error={form.formState.errors.condition?.message}><Controller control={form.control} name="condition" render={({field}) => <Select value={field.value} onValueChange={(value) => {field.onChange(value); if (form.formState.submitCount > 0) void form.trigger();}} options={inspectionConditionOptions} aria-label="成色级别" />} /></Field>

      {isBrandNew ? <details className="erp-inspection-quick-settings space-y-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-4">
        <summary className="erp-focus-ring cursor-pointer text-sm font-medium text-[var(--erp-color-text-secondary)]">{mobile ? <><span>入库设置<span className="erp-inspection-settings-hint">质保、库位与包装</span></span><ChevronRight className="h-4 w-4" /></> : "补充信息（可选）"}</summary>
        <p className="text-xs text-[var(--erp-color-text-secondary)]">沿用当前质保、带盒与默认库位，无需重复录入。</p>
        <InspectionIntakeFields form={form} showRepair={false} includeRemarks />
      </details> : <InspectionSection mobile={mobile} validationAttempt={form.formState.submitCount} title="入库信息" errors={Boolean(form.formState.errors.warrantyDate || form.formState.errors.warehouseLocation)}><div className="erp-inspection-intake-panel space-y-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4">
        <div><h3 className="text-sm font-semibold text-[var(--erp-color-text)]">入库属性确认</h3><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{isGpu ? "成色、保修、拆修、带盒和最终存放位置以检测录入为准，提交后写入库存档案。" : "其他配件只确认 SN、成色、带盒、保修期和最终存放位置。"}</p></div>
        <InspectionIntakeFields form={form} showRepair={isGpu} />
      </div></InspectionSection>}
      {mobile && isBrandNew && <dl className="erp-inspection-settings-summary" aria-label="当前入库设置">{[["存放位置", form.watch("warehouseLocation") || "未设置"], ["质保", form.watch("inWarranty") ? form.watch("warrantyDate") || "在保，日期未记录" : "无保"], ["包装", form.watch("fullBox") ? "带盒" : "无盒"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}

      </ErpMobileWorkflowSection>
      <ErpMobileWorkflowSection step={isBrandNew || !isGpu ? 0 : 1}>
      {!isBrandNew && !isGpu && <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)] p-4"><h3 className="text-sm font-semibold text-[var(--erp-color-primary)]">其他配件检测池子</h3><p className="mt-1 text-xs leading-relaxed text-[var(--erp-color-text-secondary)]">当前为配件简易检测，不需要录入烤机、跑分、显存和功耗。确认 SN、成色、带盒、保修期后即可完成检测归档。</p></div>}

      {!isBrandNew && isGpu && <GpuInspectionFields form={form} mobile={mobile} temperature={temperature} />}

      </ErpMobileWorkflowSection>
      <ErpMobileWorkflowSection step={isBrandNew || !isGpu ? 0 : 2}>
      {mobile && isGpu && !isBrandNew && <section aria-label="待确认检测信息" className="space-y-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3">
        <div><p className="break-words text-sm font-medium">{candidate.productName}</p><p className="erp-data-number mt-1 break-all text-xs text-[var(--erp-color-text-secondary)]">SN：{form.watch("serialNumber")}</p></div>
        <dl className="grid grid-cols-2 gap-3 text-xs">{[["成色", form.watch("condition")], ["库位", form.watch("warehouseLocation")], ["核心温度", `${form.watch("temperature")} °C`], ["烤机功耗", `${form.watch("wattage")} W`], ["FurMark", form.watch("furmarkResult")], ["3DMark", form.watch("threedMarkResult")]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[var(--erp-color-text-muted)]">{label}</dt><dd className="erp-data-number mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      </section>}
      <InspectionSection mobile={mobile && !isBrandNew} defaultOpen validationAttempt={form.formState.submitCount} title="结论与附件" errors={Boolean(form.formState.errors.resultStatus || form.formState.errors.remarks || form.formState.errors.images || media.error)}>
      {!isBrandNew && isGpu && <InspectionResultFields form={form} />}
      {!isBrandNew && <Field label={isGpu ? "物理测试总体批注 (最终出张随存)" : "配件检测备注"} error={form.formState.errors.remarks?.message}><Textarea {...form.register("remarks")} className="min-h-16 resize-none" placeholder={isGpu ? "请输入该卡的风扇物理清灰建议、挡板翻新指导或者后续保修的核销条码说明..." : "可记录外观、附件、保修来源或包装情况..."} /></Field>}

      {(!isBrandNew || media.items.length > 0) && <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-4"><ErpUploader items={media.items} maxCount={IMAGE_MAX_COUNT} accept={media.accept} disabled={draftPending} description="可上传外观、SN 标签、测试结果或附件图片；提交前自动压缩到约 100KB/张" uploadedDescription="图片已上传，等待随检测单保存" error={media.error} onFilesSelected={media.addFiles} onRetry={media.retry} onRemove={media.remove} onPreview={(item) => setPreviewId(item.id)} /></div>}
      </InspectionSection>
      </ErpMobileWorkflowSection>
      </fieldset>

      {validationErrorCount > 0 && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">请补充检测表单中的 {validationErrorCount} 项必填内容，具体错误已标注在对应字段下方。</p>}
      {errorMessage && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{errorMessage}</p>}
      {media.blocking && <p role="status" className="text-xs text-[var(--erp-color-warning)]">仍有图片正在上传或上传失败，请完成处理后再提交检测单。</p>}
      {submitting && !draftPending && <p role="status" className="text-xs text-[var(--erp-color-text-secondary)]">另一件商品正在保存；可继续填写当前商品，请等待上一笔完成后再提交。</p>}
      <ErpMobileWorkflowSection step={isBrandNew || !isGpu ? 0 : 2}>
      <div className="erp-form-actions erp-inspection-submit flex justify-end gap-3 border-t border-[var(--erp-color-border)] pt-4"><Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>取消</Button><Button type="submit" variant="primary" disabled={submitting || media.blocking || Boolean(duplicateOwner) || !form.watch("serialNumber").trim()}>{submitting ? "提交中…" : editing ? "保存检测单修改" : mobile && remainingCount > 0 ? `入库并测下一件 (余 ${remainingCount} 件)` : isBrandNew ? "确认全新入库" : mobile ? "提交检测入库" : isGpu ? "提交测试报告 · 录 SN 入库" : "提交配件检测 · 录 SN 入库"}</Button></div>
      </ErpMobileWorkflowSection>
    </form>
    </ErpMobileWorkflow>

    <ErpImagePreviewDialog
      open={Boolean(previewItem)}
      src={previewItem?.previewUrl}
      alt={previewItem?.name || "检测图片"}
      title={previewItem?.name || "检测图片预览"}
      onOpenChange={(open) => {if (!open) setPreviewId(null);}}
    />
  </>;
}

/** All intake modes share field geometry; only their business fields differ. */
function InspectionIntakeFields({form, showRepair, includeRemarks = false}: {form: UseFormReturn<InspectionFormValues>; showRepair: boolean; includeRemarks?: boolean}) {
  const inWarranty = form.watch("inWarranty");
  return <div data-inspection-region="intake-fields" className="erp-inspection-field-grid">
    <Field label="保修状态"><CheckField label={inWarranty ? "在保" : "无保"} checked={inWarranty} onChange={(checked) => form.setValue("inWarranty", checked, {shouldDirty: true, shouldValidate: true})} /></Field>
    <Field label="质保截止日期" error={form.formState.errors.warrantyDate?.message}><Controller control={form.control} name="warrantyDate" render={({field}) => <ErpDatePicker value={field.value} onChange={field.onChange} disabled={!inWarranty} placeholder={inWarranty ? "选择质保截止日期" : "无保，无需填写"} aria-label="保修截止日期" />} /></Field>
    <Field label="最终存放位置" error={form.formState.errors.warehouseLocation?.message}><Input {...form.register("warehouseLocation")} placeholder="A区货架-01" /></Field>
    <Field label={showRepair ? "拆修 / 带盒" : "包装附件"}><div className="flex min-h-[var(--erp-control-height)] flex-wrap items-start gap-2">
      {showRepair && <CheckField label="曾拆修" checked={form.watch("repaired")} onChange={(checked) => form.setValue("repaired", checked, {shouldDirty: true})} />}
      <CheckField label="带盒" checked={form.watch("fullBox")} onChange={(checked) => form.setValue("fullBox", checked, {shouldDirty: true})} />
    </div></Field>
    {includeRemarks && <Field wide label="入库备注（可选）" error={form.formState.errors.remarks?.message}><Textarea {...form.register("remarks")} className="min-h-16 resize-none" placeholder="可补充质保来源或包装情况" /></Field>}
  </div>;
}

function GpuInspectionFields({form, mobile, temperature}: {form: UseFormReturn<InspectionFormValues>; mobile: boolean; temperature: number}) {
  return <>
    <InspectionSection mobile={mobile} validationAttempt={form.formState.submitCount} title="外观与接口" errors={Boolean(form.formState.errors.exteriorCheck || form.formState.errors.fanCheck || form.formState.errors.portsCheck || form.formState.errors.gpuzCheck)}>
    <div className="erp-inspection-field-grid">
      <Field label="1. 物理外观与挡板腐蚀筛选"><Controller control={form.control} name="exteriorCheck" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={[{value: "完美无瑕", label: "完美无瑕 (PCB板无焦无垢、散热鳍片笔直)"}, {value: "轻微刮花", label: "轻微刮花 (外壳正常插拔轻微划伤)"}, {value: "氧化发黄", label: "氧化发黄 (PCB略微渗油、核心背部发黄)"}, {value: "挡板生锈", label: "挡板生锈 (空气潮湿、接口氧化)"}, {value: "严重磕碰", label: "严重磕碰 (鳍片损角、变形凹陷)"}]} aria-label="外观检查" />} /></Field>
      <Field label="2. 风扇轴承 & 侧LCD屏"><Controller control={form.control} name="fanCheck" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={[{value: "静音顺畅", label: "静音顺畅 (满负载静音平稳、阻值正常)"}, {value: "轻微异响", label: "轻微异响 (叶片略带灰尘、轻微轴噪声)"}, {value: "抖动偏摆", label: "抖动偏摆 (塑料框架轻微断裂、叶片晃动)"}, {value: "风扇停转", label: "风扇停转 (轴承烧毁、无PWM控制信号)"}]} aria-label="风扇检查" />} /></Field>
      <Field label="3. 信号接口检查 (DP/HDMI)"><Controller control={form.control} name="portsCheck" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={[{value: "全部正常", label: "全部正常 (全部DP与HDMI满帧握手)"}, {value: "部分接口无信号", label: "部分接口无信号 (某一DP断路失联、插槽松脱)"}, {value: "物理变形", label: "物理变形 (插头撞击下沉、金属片脱裂)"}]} aria-label="接口检查" />} /></Field>
      <Field label="4. GPU-Z 官方数据库一致性"><Controller control={form.control} name="gpuzCheck" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={[{value: "核对一致", label: "核对一致 (核心、BIOS厂商、频率通道均通过验证)"}, {value: "规格异常 / 假卡山寨", label: "规格异常 / 假卡山寨 (核心降规格、刷假BIOS假显存)"}]} aria-label="GPU-Z 检查" />} /></Field>
    </div>
    </InspectionSection>
    <InspectionSection mobile={mobile} defaultOpen validationAttempt={form.formState.submitCount} title="性能测试" errors={Boolean(form.formState.errors.furmarkResult || form.formState.errors.threedMarkResult || form.formState.errors.vramResult || form.formState.errors.temperature || form.formState.errors.wattage)}>
    <div className="erp-inspection-field-grid border-t border-[var(--erp-color-border)] pt-3"><Field label={mobile ? "FurMark 烤机结果" : "5. FurMark (甜甜圈烘烤表现评价)"} error={form.formState.errors.furmarkResult?.message}><div className="relative"><Input {...form.register("furmarkResult")} aria-label="FurMark 烤机结果" className={mobile ? undefined : "pr-28"} /><span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-xs uppercase text-[var(--erp-color-danger)] md:flex"><Flame className="h-3 w-3" />STRESS ACTIVE</span></div></Field><Field label={mobile ? "3DMark 压力测试结果" : "6. 3DMark 压力测试(TimeSpy跑分)"} error={form.formState.errors.threedMarkResult?.message}><Input {...form.register("threedMarkResult")} aria-label="3DMark 压力测试结果" /></Field></div>
    <div className="erp-inspection-field-grid erp-inspection-measurements border-t border-[var(--erp-color-border)] pt-3"><Field label="显存单元 bit-error 测试"><Controller control={form.control} name="vramResult" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={[{value: "全显存测试通过", label: "全显存通道校验[PASS] (无坏点块)"}, {value: "某显卡测试通道错误", label: "某通道损坏 / 高阻值 (显卡有坏存、易花屏)"}, {value: "黄屏/花屏", label: "严重显存黄屏/花屏 (芯片虚焊过热劣化)"}]} aria-label="显存测试" />} /></Field><Field label="最大核心温度 (°C)" error={form.formState.errors.temperature?.message}><Input type="number" min={1} max={150} step={1} {...form.register("temperature", {valueAsNumber: true})} className={`erp-data-number font-semibold ${temperature > 83 ? "border-[var(--erp-color-danger)] text-[var(--erp-color-danger)]" : "text-[var(--erp-color-primary)]"}`} /></Field><Field label="最大烤机功耗瓦数 (W)" error={form.formState.errors.wattage?.message}><Input type="number" min={1} max={2000} step={1} {...form.register("wattage", {valueAsNumber: true})} className="erp-data-number font-semibold" /></Field></div>
    <div className="flex flex-wrap items-center gap-6 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3.5 text-xs text-[var(--erp-color-text-secondary)]"><ErpCheckboxField variant="inline" checked={form.watch("repaired")} onChange={(event) => form.setValue("repaired", event.target.checked, {shouldDirty: true})} label={<span className="font-semibold">探针发现 PCB 板曾有第三方吹焊维修金手修复痕迹</span>} className="p-0 text-xs" /><ErpCheckboxField variant="inline" checked={form.watch("hiddenDefects")} onChange={(event) => form.setValue("hiddenDefects", event.target.checked, {shouldDirty: true})} label={<span className="font-semibold">存在偶发隐匿故障 (例如：接双流开多屏时可能偶发掉驱动)</span>} className="p-0 text-xs" /></div>
    </InspectionSection>
  </>;
}

function InspectionResultFields({form}: {form: UseFormReturn<InspectionFormValues>}) {
  return <div className="erp-inspection-field-grid rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4"><Field label="物理评定检测结论去向"><Controller control={form.control} name="resultStatus" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={inspectionResultOptions.map((option) => ({...option, label: resultLabel(option.value)}))} aria-label="检测结论" />} /></Field><Field label="物理质检人员签名"><Input {...form.register("inspector")} disabled /></Field></div>;
}

function useInspectionMobile() {
  return useErpPhone();
}

/** One registered form, with disclosure only on phones; desktop stays flat. */
function InspectionSection({mobile, title, errors, validationAttempt, children, defaultOpen = false}: {mobile: boolean; title: string; errors: boolean; validationAttempt: number; children: ReactNode; defaultOpen?: boolean}) {
  const sectionRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (errors && sectionRef.current) sectionRef.current.open = true;
  }, [errors, mobile, validationAttempt]);
  if (!mobile) return <>{children}</>;
  return <details ref={sectionRef} open={defaultOpen} className="erp-inspection-section">
    <summary className="erp-focus-ring flex cursor-pointer items-center justify-between gap-2 py-3 text-sm font-medium"><span>{title}</span><span className="flex items-center gap-2">{errors && <span className="text-xs text-[var(--erp-color-danger)]">请补充</span>}<ChevronRight className="h-4 w-4" /></span></summary>
    <div className="space-y-4 pb-3">{children}</div>
  </details>;
}

function InspectionMobileQueue({candidates, history, loading, canEditHistory, onSelect, onEdit, resume, onResume, completedInventoryId, refreshing}: {candidates: InspectionCandidate[]; history: InspectionHistoryItem[]; loading: boolean; canEditHistory: boolean; onSelect: (candidate: InspectionCandidate) => void; onEdit: (item: InspectionHistoryItem) => void; resume: InspectionCandidate | null; onResume: () => void; completedInventoryId: string; refreshing: boolean}) {
  const [view, setView] = useState<"pending" | "history">("pending");
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const term = keyword.trim().toLocaleLowerCase("zh-CN");
  const matches = (item: {category: string; productName: string; id: string; serialNumber: string}, extra = "") => (category === "all" || (category === "gpu" ? item.category === "显卡" : item.category !== "显卡")) && `${item.productName} ${item.id} ${item.serialNumber} ${extra}`.toLocaleLowerCase("zh-CN").includes(term);
  const pending = candidates.filter((item) => item.id !== completedInventoryId && matches(item, `${item.purchaseHandler} ${item.supplierName}`));
  const archived = history.filter((item) => matches(item, item.inspector));
  const next = candidates.find((item) => item.id !== completedInventoryId);
  return <div className="space-y-3" data-inspection-mobile="queue">
    {completedInventoryId && <div role="status" className="flex items-center justify-between gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-success-soft)] p-3"><span className="text-sm text-[var(--erp-color-success)]">检测已保存</span><Button type="button" variant="secondary" disabled={refreshing || !next} onClick={() => next && onSelect(next)}>{refreshing ? "更新中…" : next ? "检测下一件" : "已全部完成"}</Button></div>}
    {resume && <Button type="button" variant="secondary" className="!h-auto w-full justify-between gap-2 py-3" onClick={onResume}><span className="min-w-0 text-left"><span className="block text-xs text-[var(--erp-color-text-secondary)]">当前录入内容已保留</span><span className="block truncate">{resume.productName}</span></span><span className="shrink-0">继续录入</span></Button>}
    <div className="erp-inspection-queue-tabs" role="group" aria-label="检测记录范围">{([{value: "pending", label: `待入库 ${candidates.length}`}, {value: "history", label: `已完成 ${history.length}`}] as const).map((item) => <Button key={item.value} type="button" variant="ghost" aria-pressed={view === item.value} onClick={() => setView(item.value)}>{item.label}</Button>)}</div>
    <ErpSearchInput aria-label="搜索检测商品" placeholder="搜索商品、SN 或经办人" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
    <div className="erp-phone-category-strip" role="group" aria-label="检测商品类别">{[{value: "all", label: "全部"}, {value: "gpu", label: "显卡"}, {value: "accessory", label: "配件"}].map((item) => <Button key={item.value} type="button" variant="ghost" aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>{item.label}</Button>)}</div>
    {loading ? <ErpLoadingState title="正在加载检测列表" /> : view === "pending" ? pending.length ? <div className="erp-inspection-queue-records">{pending.map((item) => <ErpMobileRecordRow key={item.id} title={item.productName} icon={<PackageCheck className="h-5 w-5" />} subtitle={`经办人：${item.purchaseHandler || "未记录"}`} meta={`${item.supplierName || "来源未记录"} · 入库 ${item.inventoryDays} 天`} status={<Badge tone={item.condition === "全新" ? "success" : "warning"}>{item.condition === "全新" ? "全新" : "待检测"}</Badge>} onOpen={() => onSelect(item)} />)}</div> : <ErpEmptyState title={term ? "没有匹配的待检商品" : "当前分类没有待检商品"} /> : archived.length ? archived.map((item) => <div key={item.id} className="space-y-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3"><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-medium">{item.productName}</span><Badge tone={item.resultStatus === "通过" ? "success" : "warning"}>{item.resultStatus}</Badge></div><p className="break-all text-xs text-[var(--erp-color-text-secondary)]">SN：{item.serialNumber || "未记录"}</p><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--erp-color-text-muted)]"><span>{item.inspector || "未记录"} · {item.inspectTime}</span>{canEditHistory && <Button type="button" variant="ghost" onClick={() => onEdit(item)}>编辑检测单</Button>}</div></div>) : <ErpEmptyState title="没有匹配的检测记录" />}
  </div>;
}

function resultLabel(value: string) {
  const labels: Record<string, string> = {通过: "烤机高跑分通过 → 上架为[可售商品]", 轻微问题: "轻微瑕疵 → 降级标记为[瑕疵可售]", 需要维修: "核对出现暗病 → 转移给修理店[维修中]", 拒收入库: "检测不符假货退货 → 回退供应商[已退货]", 降价入库: "品相受损申请打折 → 最终成本扣减10%"};
  return labels[value] || value;
}

function Field({label, error, children, wide = false}: {label: string; error?: string; children: ReactNode; wide?: boolean}) {
  return <ErpField label={label} error={error} reserveErrorSpace className={`erp-inspection-field${wide ? " erp-inspection-field-wide" : ""}`}>{children}</ErpField>;
}

function CheckField({label, checked, onChange, className = "", id}: {label: string; checked: boolean; onChange: (checked: boolean) => void; className?: string; id?: string}) {
  return <ErpCheckboxField id={id} variant="card" checked={checked} onChange={(event) => onChange(event.target.checked)} label={label} className={`w-fit self-start bg-[var(--erp-color-surface-muted)] ${className}`} />;
}
