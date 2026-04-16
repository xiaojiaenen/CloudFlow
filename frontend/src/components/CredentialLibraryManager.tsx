import { useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Switch } from "@/src/components/ui/Switch";
import { useOverlayDialog } from "@/src/context/OverlayDialogContext";
import {
  CredentialRecord,
  CredentialUpsertPayload,
  WorkflowCredentialRequirementType,
} from "@/src/lib/cloudflow";

interface CredentialLibraryManagerProps {
  credentials: CredentialRecord[];
  isLoading?: boolean;
  onCreate: (payload: CredentialUpsertPayload) => Promise<void>;
  onUpdate: (id: string, payload: CredentialUpsertPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type DraftCredential = {
  name: string;
  key: string;
  type: WorkflowCredentialRequirementType;
  provider: string;
  description: string;
  payload: Record<string, string>;
};

const CREDENTIAL_TYPE_OPTIONS: Array<{
  value: WorkflowCredentialRequirementType;
  label: string;
  description: string;
}> = [
  { value: "account", label: "账号密码", description: "用户名 / 密码类登录凭据" },
  { value: "api_key", label: "API Key", description: "第三方接口密钥、令牌等" },
  { value: "cookie", label: "Cookie", description: "已登录会话、Cookie 字符串等" },
  { value: "smtp", label: "SMTP", description: "邮件服务器连接配置" },
  { value: "custom", label: "自定义", description: "适合特殊平台或私有字段结构" },
];

const PRESET_FIELDS: Record<
  WorkflowCredentialRequirementType,
  Array<{ key: string; label: string; placeholder: string; secret?: boolean; boolean?: boolean }>
> = {
  account: [
    { key: "username", label: "用户名", placeholder: "例如：admin@example.com" },
    { key: "password", label: "密码", placeholder: "请输入密码", secret: true },
  ],
  api_key: [{ key: "apiKey", label: "API Key", placeholder: "sk-...", secret: true }],
  cookie: [{ key: "cookie", label: "Cookie", placeholder: "cookie=value; another=value", secret: true }],
  smtp: [
    { key: "host", label: "SMTP Host", placeholder: "smtp.example.com" },
    { key: "port", label: "SMTP Port", placeholder: "587" },
    { key: "user", label: "SMTP User", placeholder: "user@example.com" },
    { key: "pass", label: "SMTP Password", placeholder: "请输入密码", secret: true },
    { key: "from", label: "发件人地址", placeholder: "noreply@example.com" },
    { key: "secure", label: "启用 SSL/TLS", placeholder: "", boolean: true },
  ],
  custom: [],
};

function createDraft(type: WorkflowCredentialRequirementType = "account"): DraftCredential {
  const payload = PRESET_FIELDS[type].reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.boolean ? "false" : "";
    return acc;
  }, {});

  return {
    name: "",
    key: `credential_${Date.now()}`,
    type,
    provider: "",
    description: "",
    payload,
  };
}

function normalizeKey(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

function createDraftFromCredential(credential: CredentialRecord): DraftCredential {
  const payload = Object.entries(credential.payload ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value === null || value === undefined ? "" : String(value);
    return acc;
  }, {});

  for (const field of PRESET_FIELDS[credential.type]) {
    if (!(field.key in payload)) {
      payload[field.key] = field.boolean ? "false" : "";
    }
  }

  return {
    name: credential.name,
    key: credential.key,
    type: credential.type,
    provider: credential.provider ?? "",
    description: credential.description ?? "",
    payload,
  };
}

function sanitizePayload(draft: DraftCredential) {
  const presetFields = PRESET_FIELDS[draft.type];

  if (draft.type === "custom") {
    return Object.entries(draft.payload).reduce<Record<string, string>>((acc, [key, value]) => {
      const normalizedKey = normalizeKey(key);
      if (!normalizedKey || !String(value).trim()) {
        return acc;
      }
      acc[normalizedKey] = String(value);
      return acc;
    }, {});
  }

  return presetFields.reduce<Record<string, string>>((acc, field) => {
    const value = draft.payload[field.key] ?? "";
    if (!String(value).trim() && !field.boolean) {
      return acc;
    }
    acc[field.key] = field.boolean ? String(value === "true") : String(value);
    return acc;
  }, {});
}

export function CredentialLibraryManager({
  credentials,
  isLoading = false,
  onCreate,
  onUpdate,
  onDelete,
}: CredentialLibraryManagerProps) {
  const { confirm } = useOverlayDialog();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftCredential>(() => createDraft());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!editingId && credentials.length === 0) {
      setDraft(createDraft());
    }
  }, [credentials.length, editingId]);

  const isCreating = editingId === "new";
  const currentPresetFields = PRESET_FIELDS[draft.type];
  const customEntries = useMemo(() => Object.entries(draft.payload), [draft.payload]);
  const canSubmit = draft.name.trim().length > 0 && draft.key.trim().length > 0;

  const beginCreate = () => {
    setEditingId("new");
    setDraft(createDraft());
  };

  const beginEdit = (credential: CredentialRecord) => {
    setEditingId(credential.id);
    setDraft(createDraftFromCredential(credential));
  };

  const resetEditor = () => {
    setEditingId(null);
    setDraft(createDraft());
  };

  const handleTypeChange = (nextType: WorkflowCredentialRequirementType) => {
    setDraft((current) => {
      const next = createDraft(nextType);
      return {
        ...current,
        type: nextType,
        payload: {
          ...next.payload,
          ...(nextType === "custom" ? current.payload : {}),
        },
      };
    });
  };

  const handleSave = async () => {
    if (!canSubmit) {
      return;
    }

    const payload: CredentialUpsertPayload = {
      name: draft.name.trim(),
      key: normalizeKey(draft.key),
      type: draft.type,
      provider: draft.provider.trim() || undefined,
      description: draft.description.trim() || undefined,
      payload: sanitizePayload(draft),
    };

    try {
      setIsSubmitting(true);
      if (isCreating) {
        await onCreate(payload);
      } else if (editingId) {
        await onUpdate(editingId, payload);
      }
      resetEditor();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-4 border-t border-white/[0.05] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            凭据库
          </div>
          <div className="mt-1 text-xs leading-6 text-zinc-500">
            在这里维护账号、API Key、Cookie 等凭据。运行工作流时只做绑定，执行快照里不会保存明文。
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={beginCreate}>
          <Plus className="h-3.5 w-3.5" />
          新建凭据
        </Button>
      </div>

      {editingId ? (
        <div className="space-y-4 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-100">{isCreating ? "新建凭据" : "编辑凭据"}</div>
            <button
              type="button"
              onClick={resetEditor}
              className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="凭据名称，例如：淘宝运营账号"
            />
            <Input
              value={draft.key}
              onChange={(event) =>
                setDraft((current) => ({ ...current, key: normalizeKey(event.target.value) }))
              }
              placeholder="凭据 key，例如：taobao_ops"
            />
            <Select
              value={draft.type}
              onChange={(value) => handleTypeChange(value as WorkflowCredentialRequirementType)}
              options={CREDENTIAL_TYPE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                description: option.description,
              }))}
            />
            <Input
              value={draft.provider}
              onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))}
              placeholder="提供方，例如：淘宝 / OpenAI / 自建系统"
            />
          </div>

          <Input
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            placeholder="用途说明，例如：用于登录店铺后台抓取订单"
          />

          {draft.type !== "custom" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {currentPresetFields.map((field) =>
                field.boolean ? (
                  <div key={field.key} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                    <div>
                      <div className="text-sm text-zinc-100">{field.label}</div>
                      <div className="mt-1 text-xs text-zinc-500">适用于 SMTP 等需要显式开启安全连接的场景</div>
                    </div>
                    <Switch
                      checked={draft.payload[field.key] === "true"}
                      onCheckedChange={(checked) =>
                        setDraft((current) => ({
                          ...current,
                          payload: {
                            ...current.payload,
                            [field.key]: checked ? "true" : "false",
                          },
                        }))
                      }
                    />
                  </div>
                ) : (
                  <Input
                    key={field.key}
                    type={field.secret ? "password" : "text"}
                    value={draft.payload[field.key] ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        payload: {
                          ...current.payload,
                          [field.key]: event.target.value,
                        },
                      }))
                    }
                    placeholder={field.placeholder}
                  />
                ),
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-200">自定义字段</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    可以按 key / value 自定义任意字段，例如 token、secret、tenantId。
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      payload: {
                        ...current.payload,
                        [`field_${Date.now()}`]: "",
                      },
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加字段
                </Button>
              </div>

              {customEntries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
                  还没有自定义字段，先添加一项再保存。
                </div>
              ) : (
                <div className="space-y-3">
                  {customEntries.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <Input
                        value={key}
                        onChange={(event) =>
                          setDraft((current) => {
                            const nextPayload = { ...current.payload };
                            delete nextPayload[key];
                            nextPayload[normalizeKey(event.target.value) || key] = String(value);
                            return { ...current, payload: nextPayload };
                          })
                        }
                        placeholder="字段 key，例如：token"
                      />
                      <Input
                        value={String(value)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            payload: {
                              ...current.payload,
                              [key]: event.target.value,
                            },
                          }))
                        }
                        placeholder="字段值"
                      />
                      <Button
                        variant="ghost"
                        className="justify-center text-red-300 hover:bg-red-500/10 hover:text-red-200"
                        onClick={() =>
                          setDraft((current) => {
                            const nextPayload = { ...current.payload };
                            delete nextPayload[key];
                            return { ...current, payload: nextPayload };
                          })
                        }
                      >
                        删除
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-sky-500/10 bg-sky-500/5 px-3 py-3 text-xs leading-6 text-sky-100">
            绑定后，节点里可通过
            <code className="mx-1 rounded bg-black/20 px-1.5 py-0.5">{`{{credentials.requirementKey.field}}`}</code>
            读取凭据字段，例如
            <code className="mx-1 rounded bg-black/20 px-1.5 py-0.5">{`{{credentials.taobao_account.username}}`}</code>。
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={resetEditor} disabled={isSubmitting}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={!canSubmit || isSubmitting} className="gap-2">
              <Save className="h-4 w-4" />
              {isSubmitting ? "保存中..." : isCreating ? "创建凭据" : "保存修改"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-sm text-zinc-500">
            正在加载凭据库...
          </div>
        ) : credentials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-4 text-sm text-zinc-500">
            还没有保存过凭据。建议先把常用账号、Cookie 或 API Key 存进来，运行工作流时就只需要选择绑定。
          </div>
        ) : (
          credentials.map((credential) => (
            <div key={credential.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <KeyRound className="h-4 w-4 text-amber-300" />
                    {credential.name}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {credential.key} · {credential.type}
                    {credential.provider ? ` · ${credential.provider}` : ""}
                  </div>
                  {credential.description ? (
                    <div className="mt-2 text-xs leading-5 text-zinc-400">{credential.description}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => beginEdit(credential)}>
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: "删除凭据",
                        description: `确认删除凭据“${credential.name}”吗？已经绑定这个凭据的工作流下次运行时需要重新选择。`,
                        confirmText: "确认删除",
                        cancelText: "取消",
                        tone: "danger",
                      });
                      if (!confirmed) {
                        return;
                      }
                      await onDelete(credential.id);
                      if (editingId === credential.id) {
                        resetEditor();
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(credential.maskedPayload ?? {}).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300"
                  >
                    {key}: {value || "空"}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
