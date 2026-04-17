import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Layers3, RefreshCw, ShieldCheck } from "lucide-react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { CredentialLibraryManager } from "@/src/components/CredentialLibraryManager";
import { Sidebar } from "@/src/components/Sidebar";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { useNotice } from "@/src/context/NoticeContext";
import {
  createCredential,
  CredentialRecord,
  deleteCredential,
  listCredentials,
  updateCredential,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

export default function Credentials() {
  const { notify } = useNotice();
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadCredentials = useCallback(async () => {
    try {
      setIsLoading(true);
      setCredentials(await listCredentials());
    } catch (error) {
      notify({
        tone: "error",
        title: "加载凭据库失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const metrics = useMemo(() => {
    const providerCount = new Set(
      credentials.map((item) => item.provider?.trim()).filter((value): value is string => Boolean(value)),
    ).size;
    const typeCount = new Set(credentials.map((item) => item.type)).size;

    return {
      total: credentials.length,
      providers: providerCount,
      types: typeCount,
    };
  }, [credentials]);

  const handleCreateCredential = useCallback(async (payload: Parameters<typeof createCredential>[0]) => {
    await createCredential(payload);
    await loadCredentials();
  }, [loadCredentials]);

  const handleUpdateCredential = useCallback(
    async (credentialId: string, payload: Parameters<typeof updateCredential>[1]) => {
      await updateCredential(credentialId, payload);
      await loadCredentials();
    },
    [loadCredentials],
  );

  const handleDeleteCredential = useCallback(
    async (credentialId: string) => {
      await deleteCredential(credentialId);
      await loadCredentials();
    },
    [loadCredentials],
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] font-sans text-zinc-50 selection:bg-sky-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.12),rgba(255,255,255,0))]" />

      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AppTopbar
          title="凭据库"
          subtitle="全局维护账号、API Key、Cookie、SMTP 等凭据，所有工作流在运行时按需求绑定，不再重复维护。"
          badge="Credentials"
          actions={
            <Button variant="outline" onClick={() => void loadCredentials()} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MetricCard
                icon={<KeyRound className="h-4 w-4 text-amber-300" />}
                label="凭据总数"
                value={metrics.total}
                hint="统一复用，避免每个工作流重复录入。"
              />
              <MetricCard
                icon={<Layers3 className="h-4 w-4 text-sky-300" />}
                label="凭据类型"
                value={metrics.types}
                hint="支持账号密码、API Key、Cookie、SMTP 和自定义字段。"
              />
              <MetricCard
                icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />}
                label="提供方数量"
                value={metrics.providers}
                hint="方便按平台、系统或业务来源统一管理。"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>全局凭据资产</CardTitle>
                <CardDescription>
                  这里维护的是全局凭据库；工作区里只声明“凭据需求”，运行时再从这里选择绑定项。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CredentialLibraryManager
                  credentials={credentials}
                  isLoading={isLoading}
                  onCreate={handleCreateCredential}
                  onUpdate={handleUpdateCredential}
                  onDelete={handleDeleteCredential}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-zinc-400">{label}</div>
          {icon}
        </div>
        <div className="text-3xl font-bold text-zinc-100">{value}</div>
        <div className="mt-2 text-xs leading-6 text-zinc-500">{hint}</div>
      </CardContent>
    </Card>
  );
}
