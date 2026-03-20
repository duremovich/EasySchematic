import { port } from "./_helpers";
import type { DeviceTemplate } from "../types";

export const templates: DeviceTemplate[] = [
  // AWS Elemental Media Services (cloud — logical network ports)
  {
    id: "c0a80101-00f5-4000-8000-000000000321",
    deviceType: "cloud-service",
    label: "AWS MediaConnect",
    manufacturer: "AWS",
    modelNumber: "Elemental MediaConnect",
    referenceUrl: "https://docs.aws.amazon.com/mediaconnect/latest/ug/protocols.html",
    searchTerms: ["aws", "elemental", "mediaconnect", "srt", "rist", "zixi", "rtp", "cloud", "transport"],
    ports: [
      port("SRT Source", "srt", "input", "none"),
      port("RTP Source", "ethernet", "input", "none"),
      port("Zixi Source", "ethernet", "input", "none"),
      port("RIST Source", "ethernet", "input", "none"),
      port("SRT Output 1", "srt", "output", "none"),
      port("SRT Output 2", "srt", "output", "none"),
      port("RTP Output", "ethernet", "output", "none"),
      port("Zixi Output", "ethernet", "output", "none"),
      port("RIST Output", "ethernet", "output", "none"),
    ],
  },
  {
    id: "c0a80101-00f6-4000-8000-000000000322",
    deviceType: "cloud-service",
    label: "AWS MediaLive",
    manufacturer: "AWS",
    modelNumber: "Elemental MediaLive",
    referenceUrl: "https://docs.aws.amazon.com/medialive/latest/ug/how-medialive-works-channels.html",
    searchTerms: ["aws", "elemental", "medialive", "encoder", "transcoder", "rtmp", "hls", "cloud", "live"],
    ports: [
      port("RTMP Push Input", "ethernet", "input", "none"),
      port("RTP Input", "ethernet", "input", "none"),
      port("HLS Input", "ethernet", "input", "none"),
      port("MediaConnect Input", "srt", "input", "none"),
      port("HLS Output", "ethernet", "output", "none"),
      port("RTMP Output", "ethernet", "output", "none"),
      port("RTP Output", "ethernet", "output", "none"),
      port("MediaPackage Output", "ethernet", "output", "none"),
      port("Archive Output", "ethernet", "output", "none"),
    ],
  },
  {
    id: "c0a80101-00f7-4000-8000-000000000323",
    deviceType: "cloud-service",
    label: "AWS MediaPackage",
    manufacturer: "AWS",
    modelNumber: "Elemental MediaPackage",
    referenceUrl: "https://docs.aws.amazon.com/mediapackage/latest/ug/what-is-features.html",
    searchTerms: ["aws", "elemental", "mediapackage", "packaging", "hls", "dash", "cmaf", "cloud", "origin"],
    ports: [
      port("HLS Ingest", "ethernet", "input", "none"),
      port("HLS Endpoint", "ethernet", "output", "none"),
      port("DASH Endpoint", "ethernet", "output", "none"),
      port("CMAF Endpoint", "ethernet", "output", "none"),
      port("MSS Endpoint", "ethernet", "output", "none"),
    ],
  },
];
