import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { AnnotationData } from "../types";

/**
 * Annotation node — renders a resizable rectangle or ellipse shape.
 * Created as scaffolding for #24; full implementation by Teammate D.
 */
function AnnotationNode({ data, selected }: NodeProps) {
  const annotationData = data as unknown as AnnotationData;
  const isEllipse = annotationData.shape === "ellipse";
  const bgColor = annotationData.color ?? "rgba(59, 130, 246, 0.1)";
  const border = annotationData.borderColor ?? "#3b82f6";

  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={60} minHeight={40} />
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: bgColor,
          border: `2px solid ${border}`,
          borderRadius: isEllipse ? "50%" : "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          color: "#333",
          overflow: "hidden",
        }}
      >
        {annotationData.label && <span>{annotationData.label}</span>}
      </div>
    </>
  );
}

export default memo(AnnotationNode);
