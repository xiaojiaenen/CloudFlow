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

export function formatNodeParams(data: Record<string, unknown>) {
  const definition = getNodeDefinition(String(data.type ?? ""));
  const fieldMap = new Map((definition?.fields ?? []).map((field) => [field.name, field]));

  return Object.entries(data)
    .filter(
      ([key, value]) =>
        !["label", "type", "status", "params", "clientNodeId"].includes(key) &&
        value !== undefined &&
        value !== "",
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
      const baseNode = {
        clientNodeId: node.id,
        type,
      } as Record<string, unknown>;

      if (type === "open_page") {
        baseNode.url = String(node.data.url ?? "");
      } else if (type === "click") {
        baseNode.selector = String(node.data.selector ?? "");
      } else if (type === "input") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.value = String(node.data.value ?? "");
      } else if (type === "hover") {
        baseNode.selector = String(node.data.selector ?? "");
      } else if (type === "press_key") {
        baseNode.key = String(node.data.key ?? "");
      } else if (type === "select_option") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.value = String(node.data.value ?? "");
      } else if (type === "check" || type === "uncheck") {
        baseNode.selector = String(node.data.selector ?? "");
      } else if (type === "set_variable") {
        baseNode.key = String(node.data.key ?? "");
        baseNode.value = String(node.data.value ?? "");
      } else if (type === "condition") {
        baseNode.left = String(node.data.left ?? "");
        baseNode.operator = String(node.data.operator ?? "equals");
        baseNode.right = String(node.data.right ?? "");
      } else if (type === "wait") {
        baseNode.time = Number(node.data.time ?? 1000);
      } else if (type === "wait_for_element") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.state = String(node.data.state ?? "visible");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "wait_for_text") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.text = String(node.data.text ?? "");
        baseNode.matchMode = String(node.data.matchMode ?? "contains");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "wait_for_class") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.className = String(node.data.className ?? "");
        baseNode.condition = String(node.data.condition ?? "contains");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "wait_for_url") {
        baseNode.urlIncludes = String(node.data.urlIncludes ?? "");
        baseNode.waitUntil = String(node.data.waitUntil ?? "load");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "switch_iframe") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.name = String(node.data.name ?? "");
        baseNode.urlIncludes = String(node.data.urlIncludes ?? "");
        baseNode.timeout = Number(node.data.timeout ?? 10000);
      } else if (type === "scroll") {
        baseNode.direction = String(node.data.direction ?? "down");
        baseNode.distance = Number(node.data.distance ?? 500);
      } else if (type === "extract") {
        baseNode.selector = String(node.data.selector ?? "");
        baseNode.property = String(node.data.property ?? "text");
        baseNode.attributeName = String(node.data.attributeName ?? "");
        baseNode.saveAs = String(node.data.saveAs ?? "");
      } else if (type === "screenshot") {
        baseNode.scope = String(node.data.scope ?? "viewport");
        baseNode.selector = String(node.data.selector ?? "");
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
