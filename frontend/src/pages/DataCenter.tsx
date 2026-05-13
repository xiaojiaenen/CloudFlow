import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  Database,
  Download,
  Edit3,
  Filter,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { Sidebar } from "@/src/components/Sidebar";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/Table";
import { useNotice } from "@/src/context/NoticeContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import {
  batchDeleteDataRecords,
  DataCollectionRecord,
  DataCollectionRecordsResponse,
  DataRecordRow,
  deleteDataCollection,
  deleteDataRecord,
  exportAllCollectionRecords,
  listDataCollectionRecords,
  listDataCollections,
  updateDataRecord,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getRecordTime(row: DataRecordRow) {
  return row.updatedAt && row.updatedAt !== row.createdAt ? row.updatedAt : row.createdAt;
}

function stringifyCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function escapeCsv(value: unknown) {
  const text = stringifyCellValue(value).replaceAll('"', '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildRecordsCsv(columns: string[], rows: DataRecordRow[]) {
  const header = ["recordKey", ...columns, "time", "lastTaskId", "sourceWorkflowId"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        escapeCsv(row.recordKey),
        ...columns.map((col) => escapeCsv(row.dataJson?.[col])),
        escapeCsv(getRecordTime(row)),
        escapeCsv(row.lastTaskId),
        escapeCsv(row.sourceWorkflowId),
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function MetricCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-zinc-400">{label}</div>
          {icon}
        </div>
        <div className="text-3xl font-bold text-zinc-100">{value}</div>
      </CardContent>
    </Card>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  variant = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "default"}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function EditRecordDialog({
  open,
  onOpenChange,
  record,
  columns,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DataRecordRow | null;
  columns: string[];
  onSave: (dataJson: Record<string, unknown>) => void;
}) {
  const [editJson, setEditJson] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (record && open) {
      setEditJson(JSON.stringify(record.dataJson, null, 2));
      setError("");
    }
  }, [record, open]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(editJson) as Record<string, unknown>;
      onSave(parsed);
    } catch {
      setError("JSON 格式不正确，请检查。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>编辑记录</DialogTitle>
        <DialogDescription>
          编辑记录 <span className="font-mono text-zinc-300">{record?.recordKey}</span> 的数据。
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="space-y-3">
        <div className="text-xs text-zinc-500">
          字段：{columns.length > 0 ? columns.join(", ") : "无"}
        </div>
        <textarea
          value={editJson}
          onChange={(e) => {
            setEditJson(e.target.value);
            setError("");
          }}
          spellCheck={false}
          className="min-h-[300px] w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 font-mono text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-sky-400/40"
        />
        {error ? <div className="text-xs text-red-400">{error}</div> : null}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button onClick={handleSave}>保存</Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function DataCenter() {
  const { notify } = useNotice();

  // Collection state
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collections, setCollections] = useState<DataCollectionRecord[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectionPageSize] = useState(12);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionTotalPages, setCollectionTotalPages] = useState(1);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);

  // Record state
  const [recordsResponse, setRecordsResponse] = useState<DataCollectionRecordsResponse | null>(null);
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize] = useState(20);
  const [recordSearch, setRecordSearch] = useState("");
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter state
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Selection state
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());

  // Dialog state
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState<DataCollectionRecord | null>(null);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<DataRecordRow | null>(null);
  const [editRecordTarget, setEditRecordTarget] = useState<DataRecordRow | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const debouncedCollectionSearch = useDebouncedValue(collectionSearch, 250);
  const debouncedRecordSearch = useDebouncedValue(recordSearch, 250);
  const debouncedFieldFilters = useDebouncedValue(JSON.stringify(fieldFilters), 300);

  const selectedCollection = recordsResponse?.collection ?? null;
  const columns = recordsResponse?.columns ?? [];
  const rows = recordsResponse?.items ?? [];

  /* ---- Load collections ---- */

  const loadCollections = useCallback(async () => {
    try {
      setIsLoadingCollections(true);
      const data = await listDataCollections({
        page: collectionPage,
        pageSize: collectionPageSize,
        search: debouncedCollectionSearch,
      });
      setCollections(data.items);
      setCollectionTotal(data.total);
      setCollectionTotalPages(data.totalPages);
      setSelectedCollectionId((current) => {
        if (current && data.items.some((item) => item.id === current)) return current;
        return data.items[0]?.id ?? null;
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "加载数据中心失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoadingCollections(false);
    }
  }, [collectionPage, collectionPageSize, debouncedCollectionSearch, notify]);

  /* ---- Load records ---- */

  const loadRecords = useCallback(async () => {
    if (!selectedCollectionId) {
      setRecordsResponse(null);
      return;
    }

    try {
      setIsLoadingRecords(true);
      const parsedFilters = (() => {
        try {
          return JSON.parse(debouncedFieldFilters) as Record<string, string>;
        } catch {
          return {};
        }
      })();

      const data = await listDataCollectionRecords(selectedCollectionId, {
        page: recordPage,
        pageSize: recordPageSize,
        search: debouncedRecordSearch,
        sortBy: sortBy || undefined,
        sortOrder,
        fieldFilters: Object.keys(parsedFilters).length > 0 ? parsedFilters : undefined,
      });
      setRecordsResponse(data);
    } catch (error) {
      notify({
        tone: "error",
        title: "加载数据记录失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoadingRecords(false);
    }
  }, [debouncedFieldFilters, debouncedRecordSearch, notify, recordPage, recordPageSize, selectedCollectionId, sortBy, sortOrder]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    setCollectionPage(1);
  }, [debouncedCollectionSearch]);

  useEffect(() => {
    setRecordPage(1);
    setSelectedRecordIds(new Set());
  }, [selectedCollectionId, debouncedRecordSearch, debouncedFieldFilters, sortBy, sortOrder]);

  /* ---- Metrics ---- */

  const metrics = useMemo(
    () => ({
      collections: collectionTotal,
      records: selectedCollection?.recordCount ?? 0,
      batches: selectedCollection?.batchCount ?? 0,
      fields: selectedCollection?.schemaFields.length ?? 0,
    }),
    [collectionTotal, selectedCollection],
  );

  /* ---- Sort handler ---- */

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("asc");
      }
    },
    [sortBy],
  );

  /* ---- Selection handlers ---- */

  const toggleRecordSelection = useCallback((recordId: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedRecordIds.size === rows.length) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(rows.map((r) => r.id)));
    }
  }, [rows, selectedRecordIds.size]);

  /* ---- CRUD handlers ---- */

  const handleDeleteCollection = useCallback(async () => {
    if (!deleteCollectionTarget) return;
    try {
      await deleteDataCollection(deleteCollectionTarget.id);
      notify({ tone: "success", title: "数据集已删除" });
      setSelectedCollectionId(null);
      void loadCollections();
    } catch (error) {
      notify({
        tone: "error",
        title: "删除失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    }
  }, [deleteCollectionTarget, loadCollections, notify]);

  const handleDeleteRecord = useCallback(async () => {
    if (!deleteRecordTarget) return;
    try {
      await deleteDataRecord(deleteRecordTarget.id);
      notify({ tone: "success", title: "记录已删除" });
      void loadRecords();
      void loadCollections();
    } catch (error) {
      notify({
        tone: "error",
        title: "删除失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    }
  }, [deleteRecordTarget, loadCollections, loadRecords, notify]);

  const handleEditRecord = useCallback(
    async (dataJson: Record<string, unknown>) => {
      if (!editRecordTarget) return;
      try {
        await updateDataRecord(editRecordTarget.id, dataJson);
        notify({ tone: "success", title: "记录已更新" });
        setEditRecordTarget(null);
        void loadRecords();
      } catch (error) {
        notify({
          tone: "error",
          title: "更新失败",
          description: error instanceof Error ? error.message : "请稍后重试。",
        });
      }
    },
    [editRecordTarget, loadRecords, notify],
  );

  const handleBatchDelete = useCallback(async () => {
    if (!selectedCollectionId || selectedRecordIds.size === 0) return;
    try {
      const result = await batchDeleteDataRecords(
        selectedCollectionId,
        Array.from(selectedRecordIds),
      );
      notify({ tone: "success", title: `已删除 ${result.deletedCount} 条记录` });
      setSelectedRecordIds(new Set());
      void loadRecords();
      void loadCollections();
    } catch (error) {
      notify({
        tone: "error",
        title: "批量删除失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    }
  }, [loadCollections, loadRecords, notify, selectedCollectionId, selectedRecordIds]);

  /* ---- Export handlers (no limit) ---- */

  const exportJson = useCallback(async () => {
    if (!selectedCollectionId || !selectedCollection) return;
    try {
      const data = await exportAllCollectionRecords(selectedCollectionId);
      downloadTextFile(
        `data-${selectedCollection.key}.json`,
        JSON.stringify({ collection: data.collection, columns: data.columns, items: data.items }, null, 2),
        "application/json;charset=utf-8",
      );
      notify({
        tone: "success",
        title: "数据已导出",
        description: `已导出 ${data.items.length} 条记录的 JSON 文件。`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    }
  }, [notify, selectedCollection, selectedCollectionId]);

  const exportCsv = useCallback(async () => {
    if (!selectedCollectionId || !selectedCollection) return;
    try {
      const data = await exportAllCollectionRecords(selectedCollectionId);
      downloadTextFile(
        `data-${selectedCollection.key}.csv`,
        buildRecordsCsv(data.columns, data.items),
        "text/csv;charset=utf-8",
      );
      notify({
        tone: "success",
        title: "数据已导出",
        description: `已导出 ${data.items.length} 条记录的 CSV 文件。`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    }
  }, [notify, selectedCollection, selectedCollectionId]);

  const copyCurrentPage = useCallback(async () => {
    if (!recordsResponse) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          { collection: recordsResponse.collection, columns: recordsResponse.columns, items: recordsResponse.items },
          null,
          2,
        ),
      );
      notify({ tone: "success", title: "当前页数据已复制", description: `已复制 ${recordsResponse.items.length} 条记录。` });
    } catch (error) {
      notify({
        tone: "error",
        title: "复制失败",
        description: error instanceof Error ? error.message : "当前环境暂时无法访问剪贴板。",
      });
    }
  }, [notify, recordsResponse]);

  /* ---- Sort icon helper ---- */

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-zinc-600" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3 text-sky-400" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3 text-sky-400" />
    );
  };

  const hasActiveFilters = Object.values(fieldFilters).some((v) => String(v).trim());

  /* ---- Render ---- */

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] font-sans text-zinc-50 selection:bg-sky-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(34,211,238,0.12),rgba(255,255,255,0))]" />

      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AppTopbar
          title="数据中心"
          subtitle="集中查看工作流写入的结构化数据，支持增删改查、排序筛选和导出。"
          badge="Data"
          actions={
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void Promise.all([loadCollections(), loadRecords()])}
            >
              <RefreshCw className={cn("h-4 w-4", (isLoadingCollections || isLoadingRecords) && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Metrics */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <MetricCard label="数据集总数" value={metrics.collections} icon={<Database className="h-4 w-4 text-sky-300" />} />
              <MetricCard label="当前记录数" value={metrics.records} icon={<Table2 className="h-4 w-4 text-emerald-300" />} />
              <MetricCard label="累计写入批次" value={metrics.batches} icon={<RefreshCw className="h-4 w-4 text-amber-300" />} />
              <MetricCard label="当前字段数" value={metrics.fields} icon={<Search className="h-4 w-4 text-cyan-300" />} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              {/* Left panel: Collection list */}
              <Card className="min-h-0">
                <CardHeader>
                  <CardTitle>数据集</CardTitle>
                  <CardDescription>按逻辑数据集管理保存结果。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      value={collectionSearch}
                      onChange={(e) => setCollectionSearch(e.target.value)}
                      placeholder="搜索数据集名称 / key"
                      className="pl-9"
                    />
                  </div>

                  <div className="space-y-3">
                    {collections.map((collection) => {
                      const active = collection.id === selectedCollectionId;
                      return (
                        <div
                          key={collection.id}
                          className={cn(
                            "group relative w-full rounded-2xl border p-4 transition-all",
                            active
                              ? "border-sky-400/40 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.14)]"
                              : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedCollectionId(collection.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-zinc-100">{collection.name}</div>
                                <div className="mt-1 truncate text-xs text-zinc-500">{collection.key}</div>
                              </div>
                              <div className="rounded-full border border-white/[0.08] bg-black/20 px-2 py-1 text-[11px] text-zinc-300">
                                {collection.recordCount} 条
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                              <span className="rounded-full border border-white/[0.08] px-2 py-1">批次 {collection.batchCount}</span>
                              <span className="rounded-full border border-white/[0.08] px-2 py-1">字段 {collection.schemaFields.length}</span>
                              {collection.primaryKeyField ? (
                                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                                  主键 {collection.primaryKeyField}
                                </span>
                              ) : null}
                              {collection.owner?.name ? (
                                <span className="rounded-full border border-white/[0.08] px-2 py-1">{collection.owner.name}</span>
                              ) : null}
                            </div>
                          </button>
                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteCollectionTarget(collection);
                            }}
                            className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                            title="删除数据集"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    {collections.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-10 text-center text-sm text-zinc-500">
                        当前还没有保存数据的数据集。
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-zinc-500">
                    <span>第 {collectionPage} / {collectionTotalPages} 页</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={collectionPage <= 1 || isLoadingCollections} onClick={() => setCollectionPage((v) => Math.max(1, v - 1))}>
                        上一页
                      </Button>
                      <Button variant="outline" size="sm" disabled={collectionPage >= collectionTotalPages || isLoadingCollections} onClick={() => setCollectionPage((v) => Math.min(collectionTotalPages, v + 1))}>
                        下一页
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Right panel: Record table */}
              <Card className="min-h-0">
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle>{selectedCollection?.name ?? "选择一个数据集"}</CardTitle>
                      <CardDescription>
                        {selectedCollection
                          ? `key: ${selectedCollection.key} · 最近更新 ${formatDateTime(selectedCollection.updatedAt)}`
                          : "右侧会展示数据记录明细。"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedRecordIds.size > 0 ? (
                        <Button variant="danger" size="sm" className="gap-1.5" onClick={() => setBatchDeleteOpen(true)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          删除选中 ({selectedRecordIds.size})
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" className={cn("gap-1.5", showFilters && "border-sky-400/40 text-sky-300")} onClick={() => setShowFilters((v) => !v)}>
                        <Filter className="h-3.5 w-3.5" />
                        筛选
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyCurrentPage()} disabled={!recordsResponse}>
                        <Copy className="h-3.5 w-3.5" />
                        复制
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void exportJson()} disabled={!selectedCollection}>
                        <Download className="h-3.5 w-3.5" />
                        JSON
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void exportCsv()} disabled={!selectedCollection}>
                        <Download className="h-3.5 w-3.5" />
                        CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search bar */}
                  <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      value={recordSearch}
                      onChange={(e) => setRecordSearch(e.target.value)}
                      placeholder="搜索记录键"
                      className="pl-9"
                    />
                  </div>

                  {/* Active filters indicator */}
                  {hasActiveFilters ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-zinc-500">筛选条件：</span>
                      {Object.entries(fieldFilters)
                        .filter(([, v]) => String(v).trim())
                        .map(([field, text]) => (
                          <span
                            key={field}
                            className="inline-flex items-center gap-1 rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-sky-200"
                          >
                            {field}: {text}
                            <button
                              type="button"
                              onClick={() =>
                                setFieldFilters((prev) => {
                                  const next = { ...prev };
                                  delete next[field];
                                  return next;
                                })
                              }
                              className="ml-0.5 rounded-full hover:text-sky-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      <button
                        type="button"
                        onClick={() => setFieldFilters({})}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        清除全部
                      </button>
                    </div>
                  ) : null}

                  {!selectedCollection ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-16 text-center text-sm text-zinc-500">
                      先从左侧选择一个数据集。
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                        <Table>
                          <TableHeader>
                            {/* Header row */}
                            <TableRow>
                              <TableHead className="w-10">
                                <input
                                  type="checkbox"
                                  checked={rows.length > 0 && selectedRecordIds.size === rows.length}
                                  onChange={toggleSelectAll}
                                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-transparent"
                                />
                              </TableHead>
                              <TableHead>
                                <button type="button" onClick={() => handleSort("recordKey")} className="flex items-center gap-1 hover:text-zinc-200">
                                  记录键 <SortIcon column="recordKey" />
                                </button>
                              </TableHead>
                              {columns.map((col) => (
                                <TableHead key={col}>
                                  <button type="button" onClick={() => handleSort(col)} className="flex items-center gap-1 hover:text-zinc-200">
                                    <div className="space-y-1 text-left">
                                      <div className="flex items-center">
                                        {col} <SortIcon column={col} />
                                      </div>
                                      {selectedCollection?.schemaFieldComments?.[col] ? (
                                        <div className="text-[11px] font-normal text-zinc-500">
                                          {selectedCollection.schemaFieldComments[col]}
                                        </div>
                                      ) : null}
                                    </div>
                                  </button>
                                </TableHead>
                              ))}
                              <TableHead>
                                <button type="button" onClick={() => handleSort("updatedAt")} className="flex items-center gap-1 hover:text-zinc-200">
                                  更新时间 <SortIcon column="updatedAt" />
                                </button>
                              </TableHead>
                              <TableHead className="w-20">操作</TableHead>
                            </TableRow>

                            {/* Filter row */}
                            {showFilters ? (
                              <TableRow className="border-b border-white/[0.06] bg-white/[0.01]">
                                <TableHead />
                                <TableHead>
                                  <Input
                                    value={recordSearch}
                                    onChange={(e) => setRecordSearch(e.target.value)}
                                    placeholder="筛选..."
                                    className="h-7 text-xs"
                                  />
                                </TableHead>
                                {columns.map((col) => (
                                  <TableHead key={`filter-${col}`}>
                                    <Input
                                      value={fieldFilters[col] ?? ""}
                                      onChange={(e) =>
                                        setFieldFilters((prev) => ({ ...prev, [col]: e.target.value }))
                                      }
                                      placeholder="筛选..."
                                      className="h-7 text-xs"
                                    />
                                  </TableHead>
                                ))}
                                <TableHead />
                                <TableHead />
                              </TableRow>
                            ) : null}
                          </TableHeader>
                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={columns.length + 4} className="py-12 text-center text-zinc-500">
                                  {isLoadingRecords ? "正在加载数据..." : "当前筛选条件下没有记录。"}
                                </TableCell>
                              </TableRow>
                            ) : null}

                            {rows.map((row) => (
                              <TableRow key={row.id} className="group">
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={selectedRecordIds.has(row.id)}
                                    onChange={() => toggleRecordSelection(row.id)}
                                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-transparent"
                                  />
                                </TableCell>
                                <TableCell className="font-mono text-xs text-zinc-200">{row.recordKey}</TableCell>
                                {columns.map((col) => (
                                  <TableCell key={`${row.id}-${col}`} className="max-w-[260px]">
                                    <div className="truncate" title={stringifyCellValue(row.dataJson?.[col])}>
                                      {stringifyCellValue(row.dataJson?.[col])}
                                    </div>
                                  </TableCell>
                                ))}
                                <TableCell className="text-xs text-zinc-500">
                                  {formatDateTime(getRecordTime(row))}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => setEditRecordTarget(row)}
                                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-sky-500/10 hover:text-sky-300"
                                      title="编辑"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteRecordTarget(row)}
                                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                                      title="删除"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination */}
                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>
                          第 {recordsResponse?.page ?? 1} / {recordsResponse?.totalPages ?? 1} 页 · 共 {recordsResponse?.total ?? 0} 条
                          {selectedRecordIds.size > 0 ? ` · 已选 ${selectedRecordIds.size} 条` : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={(recordsResponse?.page ?? 1) <= 1 || isLoadingRecords}
                            onClick={() => setRecordPage((v) => Math.max(1, v - 1))}
                          >
                            上一页
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={(recordsResponse?.page ?? 1) >= (recordsResponse?.totalPages ?? 1) || isLoadingRecords}
                            onClick={() => setRecordPage((v) => Math.min(recordsResponse?.totalPages ?? 1, v + 1))}
                          >
                            下一页
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Delete collection dialog */}
      <ConfirmDialog
        open={!!deleteCollectionTarget}
        onOpenChange={(open) => !open && setDeleteCollectionTarget(null)}
        title="删除数据集"
        description={`确定要删除数据集"${deleteCollectionTarget?.name}"吗？该操作会同时删除所有 ${deleteCollectionTarget?.recordCount ?? 0} 条记录和 ${deleteCollectionTarget?.batchCount ?? 0} 个写入批次，且不可恢复。`}
        confirmLabel="删除"
        onConfirm={() => void handleDeleteCollection()}
      />

      {/* Delete record dialog */}
      <ConfirmDialog
        open={!!deleteRecordTarget}
        onOpenChange={(open) => !open && setDeleteRecordTarget(null)}
        title="删除记录"
        description={`确定要删除记录"${deleteRecordTarget?.recordKey}"吗？该操作不可恢复。`}
        confirmLabel="删除"
        onConfirm={() => void handleDeleteRecord()}
      />

      {/* Batch delete dialog */}
      <ConfirmDialog
        open={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        title="批量删除记录"
        description={`确定要删除选中的 ${selectedRecordIds.size} 条记录吗？该操作不可恢复。`}
        confirmLabel="删除"
        onConfirm={() => void handleBatchDelete()}
      />

      {/* Edit record dialog */}
      <EditRecordDialog
        open={!!editRecordTarget}
        onOpenChange={(open) => !open && setEditRecordTarget(null)}
        record={editRecordTarget}
        columns={columns}
        onSave={(dataJson) => void handleEditRecord(dataJson)}
      />
    </div>
  );
}
