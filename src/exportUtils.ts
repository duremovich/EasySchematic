import { type ReactFlowInstance, getViewportForBounds } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";

const EXPORT_PADDING = 40;

interface ExportOptions {
  pixelRatio?: number;
  format?: "png" | "svg";
  backgroundColor?: string;
}

export async function exportImage(
  reactFlowInstance: ReactFlowInstance,
  options: ExportOptions = {},
) {
  const {
    pixelRatio = 3,
    format = "png",
    backgroundColor = "#ffffff",
  } = options;

  const nodes = reactFlowInstance.getNodes();
  if (nodes.length === 0) return;

  const bounds = reactFlowInstance.getNodesBounds(nodes);

  // Target dimensions with padding
  const width = bounds.width + EXPORT_PADDING * 2;
  const height = bounds.height + EXPORT_PADDING * 2;

  // Compute viewport that fits all nodes into our export area
  const viewport = getViewportForBounds(bounds, width, height, 0.5, 2, 0);

  const viewportEl = document.querySelector(
    ".react-flow__viewport",
  ) as HTMLElement;
  if (!viewportEl) return;

  const toImage = format === "svg" ? toSvg : toPng;

  const dataUrl = await toImage(viewportEl, {
    backgroundColor,
    width,
    height,
    pixelRatio: format === "svg" ? 1 : pixelRatio,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });

  // Trigger download
  const link = document.createElement("a");
  link.download = `schematic.${format}`;
  link.href = dataUrl;
  link.click();
}
