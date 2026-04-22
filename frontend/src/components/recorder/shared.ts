import type {
  RecorderActionSummary,
  RecorderExtractSuggestion,
  RecorderSessionSnapshot,
  WorkflowApiDefinition,
} from "@/src/lib/cloudflow";

export const COMMON_KEY_OPTIONS = [
  { value: "Enter", label: "Enter" },
  { value: "Tab", label: "Tab" },
  { value: "Escape", label: "Escape" },
  { value: "Space", label: "Space" },
  { value: "ArrowDown", label: "Arrow Down" },
  { value: "ArrowUp", label: "Arrow Up" },
  { value: "ArrowLeft", label: "Arrow Left" },
  { value: "ArrowRight", label: "Arrow Right" },
];

export const OUTPUT_MODE_OPTIONS = [
  { value: "workflow", label: "普通工作流" },
  { value: "template", label: "模板化输出" },
];

export const RECORDER_GUIDE_STORAGE_KEY = "cloudflow_recorder_guide_dismissed_v2";

export type RecorderBinaryPayload =
  | ArrayBuffer
  | Uint8Array
  | Blob
  | {
      type: "Buffer";
      data: number[];
    };

export type RecorderActionBlock = {
  mainAction: RecorderActionSummary;
  waitAction?: RecorderActionSummary;
};

export type RecorderActionEditorState = {
  label: string;
  selector: string;
  value: string;
  url: string;
  key: string;
  direction: "up" | "down" | "top" | "bottom";
  distance: string;
  waitUrl: string;
  parameterized: boolean;
  parameterKey: string;
  parameterLabel: string;
  parameterDescription: string;
};

export function buildActionBlocks(actions: RecorderActionSummary[]) {
  const blocks: RecorderActionBlock[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];

    if (action.type === "wait_for_url" && action.linkedActionId) {
      continue;
    }

    const nextAction = actions[index + 1];
    const waitAction =
      nextAction?.type === "wait_for_url" && nextAction.linkedActionId === action.id
        ? nextAction
        : undefined;

    blocks.push({
      mainAction: action,
      waitAction,
    });

    if (waitAction) {
      index += 1;
    }
  }

  return blocks;
}

export function createEditorState(block?: RecorderActionBlock | null): RecorderActionEditorState {
  const action = block?.mainAction;

  return {
    label: action?.label ?? "",
    selector: action?.selector ?? "",
    value: action?.value ?? "",
    url: action?.url ?? "",
    key: action?.key ?? "Enter",
    direction: action?.direction ?? "down",
    distance: String(action?.distance ?? 500),
    waitUrl: block?.waitAction?.url ?? "",
    parameterized: Boolean(action?.useRuntimeInput),
    parameterKey: action?.parameterKey ?? "",
    parameterLabel: action?.parameterLabel ?? "",
    parameterDescription: action?.parameterDescription ?? "",
  };
}

export function canMoveRecorderActionUp(blocks: RecorderActionBlock[], index: number) {
  return index > 0;
}

export function canMoveRecorderActionDown(blocks: RecorderActionBlock[], index: number) {
  return index < blocks.length - 1;
}

export function buildScreenshotSrc(snapshot?: RecorderSessionSnapshot | null) {
  if (!snapshot?.imageBase64) {
    return null;
  }

  return `data:${snapshot.mimeType || "image/jpeg"};base64,${snapshot.imageBase64}`;
}

export function normalizeBinaryPayload(payload?: RecorderBinaryPayload) {
  if (!payload) {
    return null;
  }

  if (payload instanceof Blob) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }

  if (payload instanceof Uint8Array) {
    return payload;
  }

  if (typeof payload === "object" && payload.type === "Buffer" && Array.isArray(payload.data)) {
    return new Uint8Array(payload.data);
  }

  return null;
}

export function inferSuggestionFieldMappings(suggestion: RecorderExtractSuggestion) {
  if (suggestion.targetMode !== "all") {
    return undefined;
  }

  return JSON.stringify(
    {
      value: "{{item}}",
      source: suggestion.label,
      collectedAt: "{{index}}",
    },
    null,
    2,
  );
}

export function appendSuggestionNodes(
  definition: WorkflowApiDefinition,
  suggestions: RecorderExtractSuggestion[],
) {
  if (suggestions.length === 0) {
    return definition;
  }

  const nextDefinition: WorkflowApiDefinition = {
    ...definition,
    nodes: [...definition.nodes],
    canvas: definition.canvas
      ? {
          nodes: [...definition.canvas.nodes],
          edges: [...definition.canvas.edges],
        }
      : undefined,
  };

  let maxCanvasY =
    nextDefinition.canvas?.nodes.reduce((max, node) => Math.max(max, node.position.y), 40) ?? 40;
  let previousNodeId =
    nextDefinition.canvas?.nodes[nextDefinition.canvas.nodes.length - 1]?.id ??
    String(nextDefinition.nodes[nextDefinition.nodes.length - 1]?.clientNodeId ?? "");
  let sequence = nextDefinition.nodes.length + 1;

  for (const suggestion of suggestions) {
    const extractNodeId = `recorded-node-${sequence++}`;
    const extractNode = {
      clientNodeId: extractNodeId,
      type: "extract",
      label: suggestion.label,
      selector: suggestion.selector,
      property: suggestion.property,
      targetMode: suggestion.targetMode,
      saveTarget: "both",
      saveKey: suggestion.saveKey,
      resultFormat: suggestion.targetMode === "all" ? "json_array" : undefined,
    };

    nextDefinition.nodes.push(extractNode);

    if (nextDefinition.canvas) {
      maxCanvasY += 180;
      nextDefinition.canvas.nodes.push({
        id: extractNodeId,
        type: "custom",
        position: { x: 240, y: maxCanvasY },
        data: {
          ...extractNode,
          label: suggestion.label,
          params: "",
        },
      });

      if (previousNodeId) {
        nextDefinition.canvas.edges.push({
          id: `e-${previousNodeId}-${extractNodeId}`,
          source: previousNodeId,
          target: extractNodeId,
        });
      }
    }

    previousNodeId = extractNodeId;

    if (suggestion.targetMode === "all") {
      const saveDataNodeId = `recorded-node-${sequence++}`;
      const saveDataNode = {
        clientNodeId: saveDataNodeId,
        type: "save_data",
        label: `${suggestion.label}入库`,
        collectionKey: suggestion.collectionKey ?? suggestion.saveKey,
        collectionName: suggestion.collectionName ?? suggestion.label,
        recordMode: suggestion.recommendedRecordMode ?? "array",
        sourceVariable: `{{variables.${suggestion.saveKey}}}`,
        writeMode: "upsert",
        fieldMappings: inferSuggestionFieldMappings(suggestion),
      };

      nextDefinition.nodes.push(saveDataNode);

      if (nextDefinition.canvas) {
        nextDefinition.canvas.nodes.push({
          id: saveDataNodeId,
          type: "custom",
          position: { x: 520, y: maxCanvasY + 24 },
          data: {
            ...saveDataNode,
            params: "",
          },
        });
        nextDefinition.canvas.edges.push({
          id: `e-${extractNodeId}-${saveDataNodeId}`,
          source: extractNodeId,
          target: saveDataNodeId,
        });
      }

      previousNodeId = saveDataNodeId;
    }
  }

  return nextDefinition;
}
