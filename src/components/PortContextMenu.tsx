import { useEffect, useCallback } from "react";
import { useUpdateNodeInternals } from "@xyflow/react";
import { useSchematicStore } from "../store";
import type { DeviceData, Port } from "../types";
import { portSide } from "../types";
import { useContextMenuPosition } from "../hooks/useContextMenuPosition";
import { resolvePortGender } from "../connectorTypes";

export default function PortContextMenu() {
  const menu = useSchematicStore((s) => s.portContextMenu);
  const updateNodeInternals = useUpdateNodeInternals();
  const { ref: menuRef, pos: menuPos } = useContextMenuPosition(
    menu?.screenX ?? 0,
    menu?.screenY ?? 0,
  );

  // Close on click anywhere or Escape
  useEffect(() => {
    if (!menu) return;
    const close = () => useSchematicStore.setState({ portContextMenu: null });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("contextmenu", close);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const flipPort = useCallback(() => {
    if (!menu) return;
    const { patchDeviceData, nodes } = useSchematicStore.getState();
    const node = nodes.find((n) => n.id === menu.nodeId);
    if (!node || node.type !== "device") return;
    const data = node.data as DeviceData;
    const newPorts = data.ports.map((p) =>
      p.id === menu.portId ? { ...p, flipped: !p.flipped || undefined } : p,
    );
    patchDeviceData(menu.nodeId, { ports: newPorts });
    // Force React Flow to re-measure handle positions after the flip
    updateNodeInternals(menu.nodeId);
    useSchematicStore.setState({ portContextMenu: null });
  }, [menu, updateNodeInternals]);

  const flipAllPorts = useCallback(() => {
    if (!menu) return;
    const { patchDeviceData, nodes } = useSchematicStore.getState();
    const node = nodes.find((n) => n.id === menu.nodeId);
    if (!node || node.type !== "device") return;
    const data = node.data as DeviceData;
    const newPorts = data.ports.map((p) => ({ ...p, flipped: !p.flipped || undefined }));
    patchDeviceData(menu.nodeId, { ports: newPorts });
    updateNodeInternals(menu.nodeId);
    useSchematicStore.setState({ portContextMenu: null });
  }, [menu, updateNodeInternals]);

  const editDevice = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().setEditingNodeId(menu.nodeId);
    useSchematicStore.setState({ portContextMenu: null });
  }, [menu]);

  const addTextStub = useCallback(() => {
    if (!menu) return;
    useSchematicStore.getState().addTextStub(menu.nodeId, menu.portId);
  }, [menu]);

  const convertToPassthrough = useCallback(() => {
    if (!menu) return;
    const state = useSchematicStore.getState();
    const node = state.nodes.find((n) => n.id === menu.nodeId);
    if (!node || node.type !== "device") return;
    const data = node.data as DeviceData;

    const clickedPort = data.ports.find((p) => p.id === menu.portId);
    if (!clickedPort) return;

    const siblingDirection = clickedPort.direction === "input" ? "output" : "input";
    const sibling = data.ports.find(
      (p) => p.direction === siblingDirection && p.label === clickedPort.label,
    );
    if (!sibling) return;

    const inputPort = clickedPort.direction === "input" ? clickedPort : sibling;
    const outputPort = clickedPort.direction === "output" ? clickedPort : sibling;

    const newPortId = `p${Date.now()}-conv`;
    const rearConnectorType = inputPort.connectorType;
    const frontConnectorType = outputPort.connectorType;
    const rearGender = inputPort.gender ?? (rearConnectorType ? resolvePortGender({ ...inputPort, connectorType: rearConnectorType, direction: "input" }) ?? undefined : undefined);
    const frontGender = outputPort.gender ?? (frontConnectorType ? resolvePortGender({ ...outputPort, connectorType: frontConnectorType, direction: "output" }) ?? undefined : undefined);
    const signalType = inputPort.signalType !== "custom" ? inputPort.signalType : outputPort.signalType;

    const newPort: Port = {
      id: newPortId,
      label: clickedPort.label,
      signalType,
      direction: "passthrough",
      ...(rearConnectorType ? { rearConnectorType } : {}),
      ...(rearGender ? { rearGender } : {}),
      ...(frontConnectorType ? { frontConnectorType } : {}),
      ...(frontGender ? { frontGender } : {}),
    };

    state.convertPortsToPassthrough(menu.nodeId, inputPort.id, outputPort.id, newPort);
    updateNodeInternals(menu.nodeId);
    useSchematicStore.setState({ portContextMenu: null });
  }, [menu, updateNodeInternals]);

  const convertAllToPassthrough = useCallback(() => {
    if (!menu) return;
    const state = useSchematicStore.getState();
    const node = state.nodes.find((n) => n.id === menu.nodeId);
    if (!node || node.type !== "device") return;
    const data = node.data as DeviceData;

    const consumed = new Set<string>();
    const conversions: Array<{ inputPortId: string; outputPortId: string; newPort: Port }> = [];

    for (const inputPort of data.ports) {
      if (inputPort.direction !== "input" || consumed.has(inputPort.id)) continue;
      const outputPort = data.ports.find(
        (p) => p.direction === "output" && p.label === inputPort.label && !consumed.has(p.id),
      );
      if (!outputPort) continue;
      consumed.add(inputPort.id);
      consumed.add(outputPort.id);

      const rearConnectorType = inputPort.connectorType;
      const frontConnectorType = outputPort.connectorType;
      const rearGender =
        inputPort.gender ??
        (rearConnectorType
          ? resolvePortGender({ ...inputPort, connectorType: rearConnectorType, direction: "input" }) ?? undefined
          : undefined);
      const frontGender =
        outputPort.gender ??
        (frontConnectorType
          ? resolvePortGender({ ...outputPort, connectorType: frontConnectorType, direction: "output" }) ?? undefined
          : undefined);
      const signalType = inputPort.signalType !== "custom" ? inputPort.signalType : outputPort.signalType;

      const newPort: Port = {
        id: `p${Date.now()}-conv-${conversions.length}`,
        label: inputPort.label,
        signalType,
        direction: "passthrough",
        ...(rearConnectorType ? { rearConnectorType } : {}),
        ...(rearGender ? { rearGender } : {}),
        ...(frontConnectorType ? { frontConnectorType } : {}),
        ...(frontGender ? { frontGender } : {}),
      };

      conversions.push({ inputPortId: inputPort.id, outputPortId: outputPort.id, newPort });
    }

    if (conversions.length === 0) return;
    state.convertAllPairsToPassthrough(menu.nodeId, conversions);
    updateNodeInternals(menu.nodeId);
    useSchematicStore.setState({ portContextMenu: null });
  }, [menu, updateNodeInternals]);

  if (!menu) return null;

  const node = useSchematicStore.getState().nodes.find((n) => n.id === menu.nodeId);
  if (!node || node.type !== "device") return null;
  const data = node.data as DeviceData;
  const port = data.ports.find((p) => p.id === menu.portId);
  if (!port) return null;

  const side = portSide(port);
  const flipLabel = side === "left" ? "Flip to Right" : "Flip to Left";

  // Show "Convert to passthrough" only for paired input/output ports on patch-panel or wall-plate devices.
  const canConvert =
    (port.direction === "input" || port.direction === "output") &&
    (data.deviceType === "patch-panel" || data.deviceType === "wall-plate") &&
    data.ports.some(
      (p) =>
        p.label === port.label &&
        ((port.direction === "input" && p.direction === "output") ||
          (port.direction === "output" && p.direction === "input")),
    );

  // "Convert all" is available when at least one convertible pair exists on the device.
  const canConvertAll =
    (data.deviceType === "patch-panel" || data.deviceType === "wall-plate") &&
    data.ports.some(
      (p) =>
        p.direction === "input" &&
        data.ports.some((q) => q.direction === "output" && q.label === p.label),
    );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-300 rounded shadow-lg py-1 min-w-[160px]"
      style={{
        left: menuPos.x,
        top: menuPos.y,
        maxHeight: menuPos.maxHeight,
        overflowY: menuPos.maxHeight ? "auto" : undefined,
        visibility: menuPos.ready ? "visible" : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem label={flipLabel} onClick={flipPort} />
      <MenuItem label="Flip All Ports" onClick={flipAllPorts} />
      {(canConvert || canConvertAll) && (
        <div className="border-t border-gray-200 my-1" />
      )}
      {canConvert && (
        <MenuItem label="Convert to Passthrough Circuit" onClick={convertToPassthrough} />
      )}
      {canConvertAll && (
        <MenuItem label="Convert All Ports to Passthrough" onClick={convertAllToPassthrough} />
      )}
      <div className="border-t border-gray-200 my-1" />
      <MenuItem label="Add Text Stub..." onClick={addTextStub} />
      <MenuItem label="Edit Device..." onClick={editDevice} />
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
