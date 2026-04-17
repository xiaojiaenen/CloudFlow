import type { Edge, Node } from "@xyflow/react";
import { getNodeDefinition } from "@/src/registry/nodes";
import type {
  CanvasNodeData,
  SanitizedCanvasEdge,
  SanitizedCanvasNode,
  WorkflowApiDefinition,
  WorkflowCanvasSnapshot,
  WorkflowCredentialRequirement,
  WorkflowInputField,
} from "./types";

export function shouldShowNodeField(
  nodeType: string | undefined,
  fieldName: string,
  data: Record<string, unknown>,
) {
  switch (`${nodeType}:${fieldName}`) {
    case "condition:right":
      return !["is_empty", "not_empty"].includes(String(data.operator ?? "equals"));
    case "wait_for_text:text":
      return String(data.matchMode ?? "contains") !== "not_empty";
    case "scroll:distance":
      return ["up", "down"].includes(String(data.direction ?? "down"));
    case "extract:attributeName":
      return String(data.property ?? "text") === "attribute";
    case "screenshot:selector":
      return String(data.scope ?? "viewport") === "element";
    default:
      return true;
  }
}

export function sanitizeNodeFieldValues(
  nodeType: string | undefined,
  data: Record<string, unknown>,
) {
  const definition = getNodeDefinition(nodeType ?? "");
  if (!definition) {
    return { ...data };
  }

  const nextData = { ...data };

  definition.fields.forEach((field) => {
    if (field.type === "select") {
      const currentValue = String(nextData[field.name] ?? "").trim();
      const allowedValues = new Set((field.options ?? []).map((option) => option.value));
      const fallbackValue = field.defaultValue ?? field.options?.[0]?.value;

      if (currentValue && !allowedValues.has(currentValue)) {
        if (fallbackValue) {
          nextData[field.name] = fallbackValue;
        } else {
          delete nextData[field.name];
        }
      }
    }

    if (!shouldShowNodeField(nodeType, field.name, nextData)) {
      delete nextData[field.name];
    }
  });

  return nextData;
}

export function formatNodeParams(data: Record<string, unknown>) {
  const normalizedData = sanitizeNodeFieldValues(String(data.type ?? ""), data);
  const definition = getNodeDefinition(String(normalizedData.type ?? ""));
  const fieldMap = new Map((definition?.fields ?? []).map((field) => [field.name, field]));

  return Object.entries(normalizedData)
    .filter(
      ([key, value]) =>
        !["label", "type", "status", "params", "clientNodeId"].includes(key) &&
        value !== undefined &&
        value !== "" &&
        shouldShowNodeField(String(normalizedData.type ?? ""), key, normalizedData),
    )
    .map(([key, value]) => {
      const field = fieldMap.get(key);
      const displayValue =
        field?.options?.find((option) => option.value === String(value))?.label ?? String(value);
      return `${field?.label ?? key}: ${displayValue}`;
    })
    .join(", ");
}

function buildNodeParams(data: Record<string, unknown>) {
  return formatNodeParams(data);
}

export function normalizeNumericNodeValue(value: unknown, fallback: number) {
  const text = String(value ?? "").trim();
  if (!text) {
    return fallback;
  }

  if (text.includes("{{") || text.includes("}}")) {
    return text;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : text;
}

export function formatWorkflowBuildErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const prefix = "Unsupported nodes remain in the workflow:";

  if (message.startsWith(prefix)) {
    const labels = message.slice(prefix.length).trim();
    return `当前流程里仍有未支持的节点：${labels}。请删除或替换这些节点后再保存、运行或发布。`;
  }

  return message || "工作流构建失败。";
}

function createNodeData(type: string, extra: Record<string, unknown> = {}): CanvasNodeData {
  const defaultLabel = getNodeDefinition(type)?.label ?? type;
  const data = {
    label: defaultLabel,
    type,
    status: "idle" as const,
    ...extra,
  };

  return {
    ...data,
    params: buildNodeParams(data),
  };
}

export function createEmptyCanvasGraph(): WorkflowCanvasSnapshot {
  return {
    nodes: [],
    edges: [],
  };
}

export function createDemoCanvasGraph(): WorkflowCanvasSnapshot {
  return {
    nodes: [
      {
        id: "1",
        type: "custom",
        position: { x: 250, y: 50 },
        data: createNodeData("open_page", {
          label: "Open demo page",
          url: "data:text/html,%3C!doctype%20html%3E%3Chtml%3E%3Cbody%20style%3D%22font-family%3AArial%3Bpadding%3A40px%3Bbackground%3A%230f172a%3Bcolor%3Awhite%22%3E%3Ch1%3ECloudFlow%20Demo%3C%2Fh1%3E%3Cinput%20id%3D%22username%22%20placeholder%3D%22username%22%20style%3D%22display%3Ablock%3Bmargin-bottom%3A12px%3Bpadding%3A10px%3Bwidth%3A240px%22%20%2F%3E%3Cbutton%20id%3D%22login%22%20style%3D%22padding%3A10px%2016px%22%20onclick%3D%22document.getElementById(%27result%27).textContent%20%3D%20%27Login%20clicked%27%22%3ELogin%3C%2Fbutton%3E%3Cp%20id%3D%22result%22%20style%3D%22margin-top%3A16px%22%3EWaiting...%3C%2Fp%3E%3C%2Fbody%3E%3C%2Fhtml%3E",
        }),
      },
      {
        id: "2",
        type: "custom",
        position: { x: 250, y: 200 },
        data: createNodeData("input", {
          label: "Enter username",
          selector: "#username",
          value: "test",
        }),
      },
      {
        id: "3",
        type: "custom",
        position: { x: 250, y: 350 },
        data: createNodeData("click", {
          label: "Click login button",
          selector: "#login",
        }),
      },
      {
        id: "4",
        type: "custom",
        position: { x: 250, y: 500 },
        data: createNodeData("wait", {
          label: "Wait for page to settle",
          time: "1500",
        }),
      },
    ],
    edges: [
      { id: "e1-2", source: "1", target: "2" },
      { id: "e2-3", source: "2", target: "3" },
      { id: "e3-4", source: "3", target: "4" },
    ],
  };
}

export function buildWorkflowDefinition(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  options?: {
    inputSchema?: WorkflowInputField[];
    credentialRequirements?: WorkflowCredentialRequirement[];
  },
): WorkflowApiDefinition {
  const supportedTypes = new Set([
    "open_page",
    "click",
    "input",
    "hover",
    "press_key",
    "select_option",
    "check",
    "uncheck",
    "set_variable",
    "condition",
    "wait",
    "wait_for_element",
    "wait_for_text",
    "wait_for_class",
    "wait_for_url",
    "switch_iframe",
    "switch_main_frame",
    "scroll",
    "extract",
    "screenshot",
  ]);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingCounts = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  nodes.forEach((node) => {
    incomingCounts.set(node.id, 0);
    outgoing.set(node.id, []);
  });

  edges.forEach((edge) => {
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  });

  const startNodes = nodes
    .filter((node) => (incomingCounts.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  const visited = new Set<string>();
  const orderedNodes: Node<CanvasNodeData>[] = [];

  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    visited.add(nodeId);
    orderedNodes.push(node);

    const nextNodes = (outgoing.get(nodeId) ?? [])
      .map((id) => nodeById.get(id))
      .filter((candidate): candidate is Node<CanvasNodeData> => Boolean(candidate))
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    nextNodes.forEach((nextNode) => walk(nextNode.id));
  };

  startNodes.forEach((node) => walk(node.id));

  nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .forEach((node) => orderedNodes.push(node));

  const unsupportedNodes = orderedNodes.filter((node) => !supportedTypes.has(String(node.data.type)));
  if (unsupportedNodes.length > 0) {
    const labels = unsupportedNodes.map((node) => node.data.label || node.id).join(", ");
    throw new Error(`Unsupported nodes remain in the workflow: ${labels}`);
  }

  return {
    nodes: orderedNodes.map((node) => {
      const type = String(node.data.type);
      const nodeData = sanitizeNodeFieldValues(type, node.data);
      const baseNode = {
        clientNodeId: node.id,
        type,
      } as Record<string, unknown>;

      if (type === "open_page") {
        baseNode.url = String(nodeData.url ?? "");
      } else if (type === "click") {
        baseNode.selector = String(nodeData.selector ?? "");
      } else if (type === "input") {
        baseNode.selector = String(nodeData.selector ?? "");
        baseNode.value = String(nodeData.value ?? "");
      } else if (type === "hover") {
        baseNode.selector = String(nodeData.selector ?? "");
      } else if (type === "press_key") {
        baseNode.key = String(nodeData.key ?? "");
      } else if (type === "select_option") {
        baseNode.selector = String(nodeData.selector ?? "");
        baseNode.value = String(nodeData.value ?? "");
      } else if (type === "check" || type === "uncheck") {
        baseNode.selector = String(nodeData.selector ?? "");
      } else if (type === "set_variable") {
        baseNode.key = String(nodeData.key ?? "");
        baseNode.value = String(nodeData.value ?? "");
      } else if (type === "condition") {
        baseNode.left = String(nodeData.left ?? "");
        baseNode.operator = String(nodeData.operator ?? "equals");
        if (shouldShowNodeField(type, "right", nodeData)) {
          baseNode.right = String(nodeData.right ?? "");
        }
      } else if (type === "wait") {
        baseNode.time = normalizeNumericNodeValue(nodeData.time, 1000);
      } else if (type === "wait_for_element") {
        baseNode.selector = String(nodeData.selector ?? "");
        baseNode.state = String(nodeData.state ?? "visible");
        baseNode.timeout = normalizeNumericNodeValue(nodeData.timeout, 10000);
      } else if (type === "wait_for_text") {
        baseNode.selector = String(nodeData.selector ?? "");
        if (shouldShowNodeField(type, "text", nodeData)) {
          baseNode.text = String(nodeData.text ?? "");
        }
        baseNode.matchMode = String(nodeData.matchMode ?? "contains");
        baseNode.timeout = normalizeNumericNodeValue(nodeData.timeout, 10000);
      } else if (type === "wait_for_class") {
        baseNode.selector = String(nodeData.selector ?? "");
        baseNode.className = String(nodeData.className ?? "");
        baseNode.condition = String(nodeData.condition ?? "contains");
        baseNode.timeout = normalizeNumericNodeValue(nodeData.timeout, 10000);
      } else if (type === "wait_for_url") {
        baseNode.urlIncludes = String(nodeData.urlIncludes ?? "");
        baseNode.waitUntil = String(nodeData.waitUntil ?? "load");
        baseNode.timeout = normalizeNumericNodeValue(nodeData.timeout, 10000);
      } else if (type === "switch_iframe") {
        baseNode.selector = String(nodeData.selector ?? "");
        baseNode.name = String(nodeData.name ?? "");
        baseNode.urlIncludes = String(nodeData.urlIncludes ?? "");
        baseNode.timeout = normalizeNumericNodeValue(nodeData.timeout, 10000);
      } else if (type === "scroll") {
        baseNode.direction = String(nodeData.direction ?? "down");
        if (shouldShowNodeField(type, "distance", nodeData)) {
          baseNode.distance = normalizeNumericNodeValue(nodeData.distance, 500);
        }
      } else if (type === "extract") {
        baseNode.selector = String(nodeData.selector ?? "");
        baseNode.property = String(nodeData.property ?? "text");
        if (shouldShowNodeField(type, "attributeName", nodeData)) {
          baseNode.attributeName = String(nodeData.attributeName ?? "");
        }
        baseNode.saveAs = String(nodeData.saveAs ?? "");
      } else if (type === "screenshot") {
        baseNode.scope = String(nodeData.scope ?? "viewport");
        if (shouldShowNodeField(type, "selector", nodeData)) {
          baseNode.selector = String(nodeData.selector ?? "");
        }
      }

      return baseNode;
    }),
    canvas: {
      nodes: sanitizeCanvasNodes(nodes),
      edges: sanitizeCanvasEdges(edges),
    },
    inputSchema: options?.inputSchema ?? [],
    credentialRequirements: options?.credentialRequirements ?? [],
  };
}

export function hydrateCanvasFromWorkflow(definition?: WorkflowApiDefinition | null): WorkflowCanvasSnapshot {
  if (definition?.canvas?.nodes?.length) {
    return {
      nodes: definition.canvas.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          params: buildNodeParams(node.data),
          status: "idle",
        } as CanvasNodeData,
      })),
      edges: definition.canvas.edges.map((edge) => ({ ...edge })),
    };
  }

  if (!definition?.nodes?.length) {
    return createEmptyCanvasGraph();
  }

  const nodes: SanitizedCanvasNode[] = definition.nodes.map((node, index) => {
    const type = String(node.type ?? "unknown");
    const nodeId = String(node.clientNodeId ?? index + 1);
    const data = createNodeData(type, {
      ...node,
      type,
    });

    return {
      id: nodeId,
      type: "custom",
      position: {
        x: 250,
        y: 50 + index * 150,
      },
      data,
    };
  });

  const edges: SanitizedCanvasEdge[] = nodes.slice(1).map((node, index) => ({
    id: `e${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
  }));

  return { nodes, edges };
}

export function sanitizeCanvasNodes(nodes: Node<CanvasNodeData>[]): SanitizedCanvasNode[] {
  return nodes.map((node) => {
    const data = {
      ...node.data,
      status: undefined,
    };

    return {
      id: node.id,
      type: node.type,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: {
        ...data,
        params: buildNodeParams(data),
      },
    };
  });
}

export function sanitizeCanvasEdges(edges: Edge[]): SanitizedCanvasEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }));
}
