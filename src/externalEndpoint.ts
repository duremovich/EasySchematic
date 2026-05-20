import type { DeviceData, DeviceTemplate, Port } from "./types";

export const EXTERNAL_ENDPOINT_DEVICE_TYPE = "external-endpoint";
export const EXTERNAL_ENDPOINT_DEFAULT_LABEL = "External Endpoint";
export const EXTERNAL_ENDPOINT_PORT_ID = "endpoint";
export const EXTERNAL_ENDPOINT_PORT_LABEL = "Endpoint";
export const EXTERNAL_ENDPOINT_MIN_WIDTH = 120;
export const EXTERNAL_ENDPOINT_HEIGHT = 26;

export function isExternalEndpointData(
  data: Pick<DeviceData | DeviceTemplate, "deviceType"> | null | undefined,
): boolean {
  return data?.deviceType === EXTERNAL_ENDPOINT_DEVICE_TYPE;
}

export function createExternalEndpointPort(): Port {
  return {
    id: EXTERNAL_ENDPOINT_PORT_ID,
    label: EXTERNAL_ENDPOINT_PORT_LABEL,
    signalType: "ethernet",
    direction: "bidirectional",
    connectorType: "rj45",
    addressable: false,
  };
}

export function createExternalEndpointData(
  label = EXTERNAL_ENDPOINT_DEFAULT_LABEL,
): DeviceData {
  return {
    label,
    model: EXTERNAL_ENDPOINT_DEFAULT_LABEL,
    deviceType: EXTERNAL_ENDPOINT_DEVICE_TYPE,
    ports: [createExternalEndpointPort()],
    auxiliaryData: [],
  };
}

export const EXTERNAL_ENDPOINT_TEMPLATE: DeviceTemplate = {
  deviceType: EXTERNAL_ENDPOINT_DEVICE_TYPE,
  label: EXTERNAL_ENDPOINT_DEFAULT_LABEL,
  category: "Infrastructure",
  ports: [createExternalEndpointPort()],
  auxiliaryData: [],
  searchTerms: [
    "external endpoint",
    "off page connector",
    "off page endpoint",
    "stub endpoint",
    "network handoff",
  ],
};
