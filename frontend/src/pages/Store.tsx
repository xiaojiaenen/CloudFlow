import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Layers3, RefreshCw, Search, Sparkles, Star } from "lucide-react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { InitialAvatar } from "@/src/components/InitialAvatar";
import { Sidebar } from "@/src/components/Sidebar";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { useAuth } from "@/src/context/AuthContext";
import { createWorkflow, listStoreTemplates, listWorkflows, type WorkflowRecord, type WorkflowTemplateRecord } from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

export default function Store() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [workflowData, templateData] = await Promise.all([
        listWorkflows(),
        listStoreTemplates({
          search,
          category: category === "all" ? undefined : category,
        }),
      ]);

      setWorkflows(workflowData);
      setTemplates(templateData);
    } finally {
      setIsLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const installedWorkflows = useMemo(() => {
    return new Map(
      workflows
        .filter((workflow) => workflow.installedFromTemplateId)
        .map((workflow) => [workflow.installedFromTemplateId as string, workflow]),
    );
  }, [workflows]);

  const categories = useMemo(() => {
    return ["all", ...Array.from(new Set(templates.map((item) => item.category).filter(Boolean)))];
  }, [templates]);

  const categoryOptions = useMemo(() => {
    return categories.map((item) => ({
      value: item,
      label: item === "all" ? "All categories" : item,
      description: item === "all" ? "Browse every published template" : `Filter templates in ${item}`,
      icon: <Layers3 className="h-3.5 w-3.5" />,
      group: "Template categories",
      keywords: [item],
    }));
  }, [categories]);

  const handleInstall = async (template: WorkflowTemplateRecord) => {
    const existingWorkflow = installedWorkflows.get(template.id);
    if (existingWorkflow) {
      navigate(`/?workflowId=${existingWorkflow.id}`);
      return;
    }

    try {
      setInstallingId(template.id);
      const createdWorkflow = await createWorkflow({
        name: template.title,
        description: template.description,
        status: "active",
        installedFromTemplateId: template.id,
        definition: template.definition,
      });

      navigate(`/?workflowId=${createdWorkflow.id}`);
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0C10] font-sans text-zinc-50 selection:bg-white/20">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col bg-[#0B0C10]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
        <AppTopbar
          title="Workflow Store"
          subtitle="Browse published workflow templates, install them into your workspace, and reopen installed templates from a stable template relation."
          badge="Store"
          actions={
            <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
          }
        />

        <div className="z-10 flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="text-sm text-zinc-500">
                {templates.length} published templates are available. Search, filter, and install in one click.
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search templates..."
                    className="pl-9"
                  />
                </div>
                <Select
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  className="min-w-[220px]"
                  searchable
                  searchPlaceholder="Search categories"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => {
                const installedWorkflow = installedWorkflows.get(template.id);
                const isMine = Boolean(template.publisherId && template.publisherId === user?.id);

                return (
                  <Card
                    key={template.id}
                    className="flex flex-col border-white/[0.08] bg-[#121212]/80 backdrop-blur-sm transition-colors hover:border-white/[0.15]"
                  >
                    <CardHeader>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">{template.title}</CardTitle>
                            {template.featured ? (
                              <Badge variant="success" className="gap-1">
                                <Sparkles className="h-3 w-3" />
                                Featured
                              </Badge>
                            ) : null}
                            {isMine ? <Badge variant="secondary">Published by me</Badge> : null}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            <InitialAvatar name={template.authorName} className="h-8 w-8 rounded-xl text-xs" />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-zinc-200">{template.authorName}</div>
                              <div className="mt-0.5 truncate text-zinc-500">{template.category || "Uncategorized"}</div>
                            </div>
                          </div>
                        </div>
                        {installedWorkflow ? <Badge variant="success">Installed</Badge> : null}
                      </div>
                      <CardDescription className="line-clamp-3 min-h-[60px]">{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {template.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-500">
                        Includes {template.definition.nodes.length} core nodes and can be edited immediately after installation.
                      </div>
                    </CardContent>
                    <div className="mt-auto flex items-center justify-between gap-3 px-6 pb-6 pt-0">
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <div className="flex items-center gap-1">
                          <Download className="h-3.5 w-3.5" />
                          {template.installCount.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-amber-400" />
                          {template.rating.toFixed(1)}
                        </div>
                      </div>
                      <Button
                        variant={installedWorkflow ? "outline" : "default"}
                        size="sm"
                        disabled={installingId === template.id}
                        onClick={() => void handleInstall(template)}
                      >
                        {installingId === template.id ? "Installing..." : installedWorkflow ? "Open" : "Install"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {templates.length === 0 && !isLoading ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-zinc-500">
                No templates match the current filters. Try another category or clear the search.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
