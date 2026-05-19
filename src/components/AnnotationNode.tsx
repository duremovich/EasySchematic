import { memo, type CSSProperties } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { AnnotationData } from "../types";
import { useSchematicStore } from "../store";

function AnnotationNode({ id, data, selected }: NodeProps) {
  const annotationData = data as unknown as AnnotationData;
  const bgColor = annotationData.color ?? "rgba(59, 130, 246, 0.1)";
  const border = annotationData.borderColor ?? "#3b82f6";
  const borderStyle = annotationData.borderStyle ?? "solid";
  const shape = annotationData.shape ?? "rectangle";
  const fontSize = annotationData.fontSize ?? 12;

  const handleDoubleClick = () => {
    useSchematicStore.getState().setEditingNodeId(id);
  };

  const labelStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize,
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    color: "#333",
    pointerEvents: "none",
    padding: "4px",
    textAlign: "center",
  };

  const label = annotationData.label ? (
    <span style={labelStyle}>{annotationData.label}</span>
  ) : null;

  const polygonPoints =
    shape === "diamond"
      ? "50,2 98,50 50,98 2,50"
      : "50,2 98,98 2,98";

  if (shape === "diamond" || shape === "triangle") {
    return (
      <>
        <NodeResizer isVisible={!!selected} minWidth={60} minHeight={40} />
        <div
          style={{ position: "relative", width: "100%", height: "100%" }}
          onDoubleClick={handleDoubleClick}
        >
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ display: "block" }}
          >
            <polygon
              points={polygonPoints}
              fill={bgColor}
              stroke={border}
              strokeWidth={2}
              strokeDasharray={
                borderStyle === "dashed" ? "8 4" : borderStyle === "dotted" ? "2 4" : undefined
              }
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {label}
        </div>
      </>
    );
  }

  const isRound = shape === "ellipse" || shape === "circle";

  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={60} minHeight={40} />
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: bgColor,
          border: `2px ${borderStyle} ${border}`,
          borderRadius: isRound ? "50%" : "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize,
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          color: "#333",
          overflow: "hidden",
          textAlign: "center",
          padding: "4px",
        }}
        onDoubleClick={handleDoubleClick}
      >
        {annotationData.label && <span>{annotationData.label}</span>}
      </div>
    </>
  );
}

export default memo(AnnotationNode);
