import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, PencilLine } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/Input";

type DialogTone = "default" | "danger";

interface BaseDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
}

interface ConfirmDialogOptions extends BaseDialogOptions {}

interface PromptDialogOptions extends BaseDialogOptions {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  inputHint?: string;
}

type DialogRequest =
  | { type: "confirm"; options: ConfirmDialogOptions }
  | { type: "prompt"; options: PromptDialogOptions };

interface OverlayDialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

const OverlayDialogContext = createContext<OverlayDialogContextValue | undefined>(undefined);

export function OverlayDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolverRef = useRef<((value: unknown) => void) | null>(null);

  const closeDialog = useCallback((value: boolean | string | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setRequest(null);
    setInputValue("");
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(null);
      resolverRef.current = null;
    };
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest({
        type: "confirm",
        options,
      });
    });
  }, []);

  const prompt = useCallback((options: PromptDialogOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      setInputValue(options.defaultValue ?? "");
      setRequest({
        type: "prompt",
        options,
      });
    });
  }, []);

  const value = useMemo<OverlayDialogContextValue>(
    () => ({
      confirm,
      prompt,
    }),
    [confirm, prompt],
  );

  const tone = request?.options.tone ?? "default";
  const isPrompt = request?.type === "prompt";

  return (
    <OverlayDialogContext.Provider value={value}>
      {children}

      <Dialog
        open={Boolean(request)}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog(request?.type === "confirm" ? false : null);
          }
        }}
        className="max-w-lg"
      >
        {request ? (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4 pr-10">
                <div
                  className={
                    tone === "danger"
                      ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-200"
                      : "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-sky-200"
                  }
                >
                  {isPrompt ? <PencilLine className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <DialogTitle>{request.options.title}</DialogTitle>
                  {request.options.description ? (
                    <DialogDescription>{request.options.description}</DialogDescription>
                  ) : null}
                </div>
              </div>
            </DialogHeader>

            {isPrompt ? (
              <DialogContent className="space-y-3">
                {request.options.label ? (
                  <label className="block text-sm font-medium text-zinc-200">{request.options.label}</label>
                ) : null}
                <Input
                  autoFocus
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={request.options.placeholder}
                  className="h-11 rounded-xl"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      closeDialog(inputValue);
                    }
                  }}
                />
                {request.options.inputHint ? (
                  <p className="text-xs leading-6 text-zinc-500">{request.options.inputHint}</p>
                ) : null}
              </DialogContent>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => closeDialog(request.type === "confirm" ? false : null)}
              >
                {request.options.cancelText ?? "取消"}
              </Button>
              <Button
                type="button"
                variant={tone === "danger" ? "danger" : "default"}
                onClick={() => closeDialog(request.type === "confirm" ? true : inputValue)}
              >
                {request.options.confirmText ?? "确认"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </OverlayDialogContext.Provider>
  );
}

export function useOverlayDialog() {
  const context = useContext(OverlayDialogContext);
  if (!context) {
    throw new Error("useOverlayDialog must be used within OverlayDialogProvider");
  }

  return context;
}
