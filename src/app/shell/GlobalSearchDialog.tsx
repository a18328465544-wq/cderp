import {
  Boxes,
  ClipboardCheck,
  Command,
  CornerDownLeft,
  FileText,
  PackageSearch,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {useQuery} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {useEffect, useMemo, useState, type KeyboardEvent} from "react";
import {Button, Dialog, Input} from "@/src/components/ui";
import {navigationItems} from "@/src/config/navigation";
import {isMenuAllowed} from "@/src/utils/menu";
import {matchesKeyword} from "@/src/utils/search";
import {useAuth} from "@/src/app/auth";
import {cn} from "@/src/lib/cn";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {globalSearchApi, queryKeys, stateApi} from "@/src/services/api";
import type {GlobalSearchResult, GlobalSearchResultKind} from "@/src/types/global-search";
import {searchGlobalSnapshot} from "@/src/utils/globalSearchSnapshot";

type DisplayResult = {
  id: string;
  title: string;
  subtitle: string;
  path: string;
  icon: LucideIcon;
  section: "module" | "business";
};

const businessKindLabels: Record<GlobalSearchResultKind, string> = {
  product: "商品模板",
  inventory: "库存",
  inspection: "质检记录",
  customer: "客户",
  vendor: "同行",
  purchase: "采购单",
  sales: "销售单",
  quote: "行情",
  return: "退货单",
  order: "订单",
  aftersales: "售后",
};

const businessKindIcons: Record<GlobalSearchResultKind, LucideIcon> = {
  product: PackageSearch,
  inventory: Boxes,
  inspection: Wrench,
  customer: UserRound,
  vendor: UsersRound,
  purchase: ShoppingCart,
  sales: Receipt,
  quote: FileText,
  return: RefreshCw,
  order: ClipboardCheck,
  aftersales: RefreshCw,
};

function businessResultPath(item: GlobalSearchResult) {
  const params = new URLSearchParams();
  if (item.kind === "inspection") params.set("inventory", item.reference);
  else if (item.reference) params.set("keyword", item.reference);
  if (["purchase", "sales", "return", "order", "aftersales"].includes(item.kind)) params.set("page", "1");
  return `${item.route}?${params.toString()}`;
}

export function GlobalSearchDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const {session} = useAuth();
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedSearchText = useDebouncedValue(searchText, 180);

  const allowedItems = useMemo(
    () => navigationItems.filter((item) => isMenuAllowed(session?.permissions.allowedMenus || [], item.id)),
    [session?.permissions.allowedMenus],
  );
  const businessQuery = useQuery({
    queryKey: queryKeys.globalSearch.search(debouncedSearchText.trim()),
    queryFn: ({signal}) => globalSearchApi.search(debouncedSearchText, signal),
    enabled: open && Boolean(debouncedSearchText.trim()),
    retry: false,
    staleTime: 30_000,
  });
  const snapshotQuery = useQuery({
    queryKey: queryKeys.state.initial(),
    queryFn: ({signal}) => stateApi.initial(signal),
    enabled: open && Boolean(session) && Boolean(debouncedSearchText.trim()),
    retry: false,
    staleTime: 30_000,
  });
  const moduleResults = useMemo<DisplayResult[]>(() => {
    const query = searchText.trim();
    return allowedItems
      .filter((item) => matchesKeyword([item.label, item.path, item.group, item.id], query))
      .slice(0, 24)
      .map((item) => ({
        id: `module:${item.id}`,
        title: item.label,
        subtitle: item.path,
        path: item.path,
        icon: item.icon,
        section: "module" as const,
      }));
  }, [allowedItems, searchText]);
  const localFallbackResults = useMemo(
    () => businessQuery.isError
      ? searchGlobalSnapshot(snapshotQuery.data, debouncedSearchText, session?.permissions.allowedMenus || [])
      : [],
    [businessQuery.isError, debouncedSearchText, session?.permissions.allowedMenus, snapshotQuery.data],
  );
  const businessResults = useMemo<DisplayResult[]>(() => (businessQuery.isError ? localFallbackResults : businessQuery.data?.items || []).map((item) => ({
    id: `business:${item.kind}:${item.id}`,
    title: item.title,
    subtitle: [businessKindLabels[item.kind], item.subtitle].filter(Boolean).join(" · "),
    path: businessResultPath(item),
    icon: businessKindIcons[item.kind],
    section: "business" as const,
  })), [businessQuery.data?.items, businessQuery.isError, localFallbackResults]);
  const results = useMemo(() => [...moduleResults, ...businessResults], [businessResults, moduleResults]);
  const hasQuery = Boolean(searchText.trim());
  const isSearching = hasQuery && (businessQuery.isPending || businessQuery.isFetching);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSearchText("");
      setActiveIndex(0);
    }
  };

  const openResult = (path: string) => {
    close(false);
    void navigate({to: path});
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) openResult(selected.path);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className="erp-modal-layer fixed inset-0 bg-[var(--erp-color-backdrop)] backdrop-blur-[2px]" />
        <Dialog.Viewport className="erp-modal-layer fixed inset-0 flex items-start justify-center p-4 pt-[12vh]">
          <Dialog.Popup className="w-full max-w-xl overflow-hidden rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-white shadow-[var(--erp-shadow-popover)]">
            <div className="flex items-center gap-3 border-b border-[var(--erp-color-border)] px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
              <Input
                autoFocus
                density="compact"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="搜索工作区、SN、客户、订单、采购/销售单或 GPU 型号"
                aria-label="全局搜索"
                className="border-0 px-0 shadow-none focus:ring-0"
              />
              <span className="hidden shrink-0 items-center gap-1 rounded border border-[var(--erp-color-border)] px-1.5 py-0.5 text-xs text-[var(--erp-color-text-muted)] sm:inline-flex">
                <Command className="h-3 w-3" aria-hidden="true" />K
              </span>
            </div>
            <Dialog.Title className="sr-only">全局搜索</Dialog.Title>
            <Dialog.Description className="sr-only">搜索并打开当前账号有权访问的工作区页面和业务数据。</Dialog.Description>
            <div className="erp-scrollbar max-h-[min(28rem,60vh)] overflow-y-auto p-2" role="listbox" aria-label="搜索结果">
              {results.length ? (
                results.map((item, index) => {
                  const isSelected = index === activeIndex;
                  const showBusinessHeading = item.section === "business" && (index === 0 || results[index - 1]?.section !== "business");
                  return (
                    <div key={item.id}>
                      {showBusinessHeading && <p className="px-3 pb-1 pt-2 text-xs font-semibold text-[var(--erp-color-text-muted)]">业务数据</p>}
                      {item.section === "module" && index === 0 && <p className="px-3 pb-1 pt-1 text-xs font-semibold text-[var(--erp-color-text-muted)]">工作区</p>}
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-auto w-full justify-start gap-3 rounded-[var(--erp-radius-md)] px-3 py-2.5 text-left transition-colors",
                          isSelected && "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)] font-medium",
                        )}
                        onClick={() => openResult(item.path)}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isSelected ? "text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text-muted)]",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{item.title}</span>
                          <span
                            className={cn(
                              "block truncate text-xs",
                              isSelected ? "text-[var(--erp-color-primary)]/80" : "text-[var(--erp-color-text-muted)]",
                            )}
                          >
                            {item.subtitle}
                          </span>
                        </span>
                        {isSelected && (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[var(--erp-color-primary)] opacity-70" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  );
                })
              ) : (
                <p className="px-3 py-8 text-center text-sm text-[var(--erp-color-text-muted)]" role="status">
                  {isSearching ? "正在搜索业务数据…" : hasQuery && businessQuery.isError ? "业务数据搜索暂时不可用，暂未找到已加载的匹配数据" : hasQuery ? "没有匹配的已授权页面或业务数据" : "没有匹配的已授权工作区"}
                </p>
              )}
              {isSearching && results.length > 0 && <p className="px-3 pb-2 pt-1 text-center text-xs text-[var(--erp-color-text-muted)]">正在补充业务数据…</p>}
              {businessQuery.isError && localFallbackResults.length > 0 && <p className="px-3 pb-2 pt-1 text-center text-xs text-[var(--erp-color-text-muted)]">业务搜索服务暂时不可用，已显示当前已加载的数据</p>}
            </div>
            {results.length > 0 && (
              <div className="flex items-center justify-between border-t border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/60 px-4 py-2 text-xs text-[var(--erp-color-text-muted)]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-1 py-0.5 erp-data-number text-xs">↑↓</kbd>
                    导航
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-1 py-0.5 erp-data-number text-xs">↵</kbd>
                    进入
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-1 py-0.5 erp-data-number text-xs">esc</kbd>
                    关闭
                  </span>
                </div>
                <span className="tabular-nums">共 {results.length} 个结果</span>
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
