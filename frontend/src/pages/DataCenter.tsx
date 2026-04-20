import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Database,
  Download,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { Sidebar } from "@/src/components/Sidebar";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/Table";
import { useNotice } from "@/src/context/NoticeContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import {
  DataCollectionRecord,
  DataCollectionRecordsResponse,
  DataRecordRow,
  listDataCollectionRecords,
  listDataCollections,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function stringifyCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }

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
  const header = ["recordKey", ...columns, "updatedAt", "lastTaskId", "sourceWorkflowId"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        escapeCsv(row.recordKey),
        ...columns.map((column) => escapeCsv(row.dataJson?.[column])),
        escapeCsv(row.updatedAt),
        escapeCsv(row.lastTaskId),
        escapeCsv(row.sourceWorkflowId),
      ].join(","),
    ),
  ];

  return lines.join("\n");
}

export default function DataCenter() {
  const { notify } = useNotice();
  const [collectionSearch, setCollectionSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [collections, setCollections] = useState<DataCollectionRecord[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [recordsResponse, setRecordsResponse] = useState<DataCollectionRecordsResponse | null>(null);
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectionPageSize] = useState(12);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionTotalPages, setCollectionTotalPages] = useState(1);
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize] = useState(20);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const debouncedCollectionSearch = useDebouncedValue(collectionSearch, 250);
  const debouncedRecordSearch = useDebouncedValue(recordSearch, 250);

  const selectedCollection = recordsResponse?.collection ?? null;
  const columns = recordsResponse?.columns ?? [];
  const rows = recordsResponse?.items ?? [];

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
        if (current && data.items.some((item) => item.id === current)) {
          return current;
        }
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

  const loadRecords = useCallback(async () => {
    if (!selectedCollectionId) {
      setRecordsResponse(null);
      return;
    }

    try {
      setIsLoadingRecords(true);
      const data = await listDataCollectionRecords(selectedCollectionId, {
        page: recordPage,
        pageSize: recordPageSize,
        search: debouncedRecordSearch,
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
  }, [debouncedRecordSearch, notify, recordPage, recordPageSize, selectedCollectionId]);

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
  }, [selectedCollectionId, debouncedRecordSearch]);

  const metrics = useMemo(
    () => ({
      collections: collectionTotal,
      records: selectedCollection?.recordCount ?? 0,
      batches: selectedCollection?.batchCount ?? 0,
      fields: selectedCollection?.schemaFields.length ?? 0,
    }),
    [collectionTotal, selectedCollection],
  );

  const exportJson = useCallback(async () => {
    if (!selectedCollectionId || !selectedCollection) {
      return;
    }

    const data = await listDataCollectionRecords(selectedCollectionId, {
      page: 1,
      pageSize: 1000,
      search: debouncedRecordSearch,
    });

    downloadTextFile(
      `data-${selectedCollection.key}.json`,
      JSON.stringify(
        {
          collection: data.collection,
          columns: data.columns,
          items: data.items,
        },
        null,
        2,
      ),
      "application/json;charset=utf-8",
    );

    notify({
      tone: "success",
      title: "数据已导出",
      description: `已导出 ${data.items.length} 条记录的 JSON 文件。`,
    });
  }, [debouncedRecordSearch, notify, selectedCollection, selectedCollectionId]);

  const exportCsv = useCallback(async () => {
    if (!selectedCollectionId || !selectedCollection) {
      return;
    }

    const data = await listDataCollectionRecords(selectedCollectionId, {
      page: 1,
      pageSize: 1000,
      search: debouncedRecordSearch,
    });

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
  }, [debouncedRecordSearch, notify, selectedCollection, selectedCollectionId]);

  const copyCurrentPage = useCallback(async () => {
    if (!recordsResponse) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            collection: recordsResponse.collection,
            columns: recordsResponse.columns,
            items: recordsResponse.items,
          },
          null,
          2,
        ),
      );

      notify({
        tone: "success",
        title: "当前页数据已复制",
        description: `已复制 ${recordsResponse.items.length} 条记录。`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "复制失败",
        description: error instanceof Error ? error.message : "当前环境暂时无法访问剪贴板。",
      });
    }
  }, [notify, recordsResponse]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] font-sans text-zinc-50 selection:bg-sky-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(34,211,238,0.12),rgba(255,255,255,0))]" />

      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AppTopbar
          title="数据中心"
          subtitle="集中查看工作流写入的结构化数据，支持按数据集预览、复制和导出。"
          badge="Data"
          actions={
            <Button variant="outline" className="gap-2" onClick={() => void Promise.all([loadCollections(), loadRecords()])}>
              <RefreshCw className={cn("h-4 w-4", (isLoadingCollections || isLoadingRecords) && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <MetricCard label="数据集总数" value={metrics.collections} icon={<Database className="h-4 w-4 text-sky-300" />} />
              <MetricCard label="当前记录数" value={metrics.records} icon={<Table2 className="h-4 w-4 text-emerald-300" />} />
              <MetricCard label="累计写入批次" value={metrics.batches} icon={<RefreshCw className="h-4 w-4 text-amber-300" />} />
              <MetricCard label="当前字段数" value={metrics.fields} icon={<Search className="h-4 w-4 text-cyan-300" />} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card className="min-h-0">
                <CardHeader>
                  <CardTitle>数据集</CardTitle>
                  <CardDescription>按逻辑数据集管理保存结果，适合长期积累和后续导出。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      value={collectionSearch}
                      onChange={(event) => setCollectionSearch(event.target.value)}
                      placeholder="搜索数据集名称 / key"
                      className="pl-9"
                    />
                  </div>

                  <div className="space-y-3">
                    {collections.map((collection) => {
                      const active = collection.id === selectedCollectionId;

                      return (
                        <button
                          key={collection.id}
                          type="button"
                          onClick={() => setSelectedCollectionId(collection.id)}
                          className={cn(
                            "w-full rounded-2xl border p-4 text-left transition-all",
                            active
                              ? "border-sky-400/40 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.14)]"
                              : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]",
                          )}
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
                            <span className="rounded-full border border-white/[0.08] px-2 py-1">
                              批次 {collection.batchCount}
                            </span>
                            <span className="rounded-full border border-white/[0.08] px-2 py-1">
                              字段 {collection.schemaFields.length}
                            </span>
                            {collection.owner?.name ? (
                              <span className="rounded-full border border-white/[0.08] px-2 py-1">
                                {collection.owner.name}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}

                    {collections.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-10 text-center text-sm text-zinc-500">
                        当前还没有保存数据的数据集。
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs text-zinc-500">
                    <span>
                      第 {collectionPage} / {collectionTotalPages} 页
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={collectionPage <= 1 || isLoadingCollections}
                        onClick={() => setCollectionPage((value) => Math.max(1, value - 1))}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={collectionPage >= collectionTotalPages || isLoadingCollections}
                        onClick={() => setCollectionPage((value) => Math.min(collectionTotalPages, value + 1))}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-h-0">
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle>{selectedCollection?.name ?? "选择一个数据集"}</CardTitle>
                      <CardDescription>
                        {selectedCollection
                          ? `key: ${selectedCollection.key} · 最近更新 ${formatDateTime(selectedCollection.updatedAt)}`
                          : "右侧会展示数据记录明细与导出能力。"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => void copyCurrentPage()} disabled={!recordsResponse}>
                        <Copy className="h-4 w-4" />
                        复制当前页
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => void exportJson()} disabled={!selectedCollection}>
                        <Download className="h-4 w-4" />
                        导出 JSON
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => void exportCsv()} disabled={!selectedCollection}>
                        <Download className="h-4 w-4" />
                        导出 CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      value={recordSearch}
                      onChange={(event) => setRecordSearch(event.target.value)}
                      placeholder="搜索记录键"
                      className="pl-9"
                    />
                  </div>

                  {!selectedCollection ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-16 text-center text-sm text-zinc-500">
                      先从左侧选择一个数据集。
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>记录键</TableHead>
                              {columns.map((column) => (
                                <TableHead key={column}>{column}</TableHead>
                              ))}
                              <TableHead>更新时间</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={columns.length + 2} className="py-12 text-center text-zinc-500">
                                  {isLoadingRecords ? "正在加载数据..." : "当前筛选条件下没有记录。"}
                                </TableCell>
                              </TableRow>
                            ) : null}

                            {rows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="font-mono text-xs text-zinc-200">{row.recordKey}</TableCell>
                                {columns.map((column) => (
                                  <TableCell key={`${row.id}-${column}`} className="max-w-[260px]">
                                    <div className="truncate" title={stringifyCellValue(row.dataJson?.[column])}>
                                      {stringifyCellValue(row.dataJson?.[column])}
                                    </div>
                                  </TableCell>
                                ))}
                                <TableCell className="text-xs text-zinc-500">{formatDateTime(row.updatedAt)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>
                          第 {recordsResponse?.page ?? 1} / {recordsResponse?.totalPages ?? 1} 页 · 共 {recordsResponse?.total ?? 0} 条
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={(recordsResponse?.page ?? 1) <= 1 || isLoadingRecords}
                            onClick={() => setRecordPage((value) => Math.max(1, value - 1))}
                          >
                            上一页
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={(recordsResponse?.page ?? 1) >= (recordsResponse?.totalPages ?? 1) || isLoadingRecords}
                            onClick={() => setRecordPage((value) => Math.min(recordsResponse?.totalPages ?? 1, value + 1))}
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
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
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
