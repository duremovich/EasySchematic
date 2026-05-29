import type { FillSeriesConfig } from "./types";
import { ipToNumber, numberToIp, isValidIpv4, isValidSubnetMask, isValidVlan } from "../networkValidation";

export function generateIncrementingLabelSeries(start: string, count: number, step: number): string[] {
  if (count <= 0) return [];

  const match = start.match(/^(.*?)(\d+)(\D*)$/);
  if (match) {
    const [, prefix, numStr, suffix] = match;
    const padLen = numStr.length;
    const startNum = Number(numStr);
    return Array.from({ length: count }, (_, i) => {
      const val = startNum + i * step;
      return `${prefix}${String(val).padStart(padLen, "0")}${suffix}`;
    });
  }

  return Array.from({ length: count }, (_, i) => `${start} ${1 + i * step}`);
}

export const FILL_SERIES_CONFIGS: Record<string, FillSeriesConfig> = {
  ip: {
    label: "IP Address",
    defaultStep: 1,
    stepLabel: "Increment by",
    validate: isValidIpv4,
    generateSeries(start: string, count: number, step: number): string[] {
      const num = ipToNumber(start);
      if (num === null) return Array(count).fill(start);
      return Array.from({ length: count }, (_, i) => numberToIp(num + i * step));
    },
  },

  subnet: {
    label: "Subnet Mask",
    defaultStep: 0,
    stepLabel: "Increment by",
    validate: isValidSubnetMask,
    generateSeries(start: string, count: number, step: number): string[] {
      if (step === 0) return Array(count).fill(start);
      const num = ipToNumber(start);
      if (num === null) return Array(count).fill(start);
      return Array.from({ length: count }, (_, i) => numberToIp(num + i * step));
    },
  },

  gateway: {
    label: "Gateway",
    defaultStep: 0,
    stepLabel: "Increment by",
    validate: isValidIpv4,
    generateSeries(start: string, count: number, step: number): string[] {
      if (step === 0) return Array(count).fill(start);
      const num = ipToNumber(start);
      if (num === null) return Array(count).fill(start);
      return Array.from({ length: count }, (_, i) => numberToIp(num + i * step));
    },
  },

  vlan: {
    label: "VLAN",
    defaultStep: 0,
    stepLabel: "Increment by",
    validate: (v: string) => v === "" || isValidVlan(Number(v)),
    generateSeries(start: string, count: number, step: number): string[] {
      const num = Number(start);
      if (isNaN(num)) return Array(count).fill(start);
      return Array.from({ length: count }, (_, i) => String(num + i * step));
    },
  },

  number: {
    label: "Number",
    defaultStep: 1,
    stepLabel: "Increment by",
    generateSeries(start: string, count: number, step: number): string[] {
      const num = Number(start);
      if (isNaN(num)) return Array(count).fill(start);
      return Array.from({ length: count }, (_, i) => String(num + i * step));
    },
  },

  name: {
    label: "Name",
    defaultStep: 1,
    stepLabel: "Increment by",
    generateSeries(start: string, count: number, step: number): string[] {
      const match = start.match(/^(.*?)(\d+)$/);
      if (!match) return Array(count).fill(start);
      const prefix = match[1];
      const numStr = match[2];
      const padLen = numStr.length;
      const startNum = Number(numStr);
      return Array.from({ length: count }, (_, i) => {
        const val = startNum + i * step;
        return prefix + String(val).padStart(padLen, "0");
      });
    },
  },

  deviceName: {
    label: "Device Name",
    defaultStep: 1,
    stepLabel: "Increment by",
    generateSeries(start: string, count: number, step: number): string[] {
      return generateIncrementingLabelSeries(start, count, step);
    },
  },
};
