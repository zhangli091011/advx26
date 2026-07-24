export const hardwareCategories = [
  "MOTOR_CONTROLLER",
  "ROBOT_CONTROLLER",
  "POWER_MODULE",
  "SENSOR",
  "ENCODER",
  "CAMERA",
  "NETWORK_DEVICE",
  "COMMUNICATION_ADAPTER",
  "CUSTOM_PCB",
  "TOOL",
  "UNKNOWN",
] as const;

export type HardwareCategory = (typeof hardwareCategories)[number];

export type ImageQuality = {
  accepted: boolean;
  score: number;
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  edgeScore: number;
  brightRatio: number;
  darkRatio: number;
  issues: Array<{
    code: "BLURRY" | "OVEREXPOSED" | "UNDEREXPOSED" | "LOW_CONTRAST" | "TOO_SMALL";
    message: string;
  }>;
};

export type ObservedText = {
  text: string;
  type:
    | "MANUFACTURER"
    | "MODEL"
    | "PART_NUMBER"
    | "REVISION"
    | "CHIP_MARKING"
    | "INTERFACE_LABEL"
    | "VOLTAGE_TEXT"
    | "OTHER";
  confidence: number;
};

export type VisionGuess = {
  manufacturer: string | null;
  model: string | null;
  category: HardwareCategory;
  partNumber: string | null;
  revision: string | null;
  visibleInterfaces: string[];
  possibleProtocols: string[];
  confidence: number;
  warnings: string[];
};

export type HardwareDeviceDto = {
  id: string;
  manufacturer: string;
  model: string;
  category: HardwareCategory;
  partNumber: string | null;
  revision: string | null;
  voltageSummary: string | null;
  protocols: string[];
  interfaces: string[];
  description: string | null;
  sourceUrl: string | null;
  usageUrl: string | null;
  pinoutUrl: string | null;
};

export type HardwareCandidate = {
  device: HardwareDeviceDto;
  score: number;
  reasons: string[];
};

export type HardwareScanDto = {
  id: string;
  status: "NEEDS_CONFIRMATION" | "CONFIRMED" | "UNKNOWN" | "FAILED";
  provider: string;
  providerModel: string | null;
  summary: string;
  observedTexts: ObservedText[];
  visualGuess: VisionGuess;
  candidates: HardwareCandidate[];
  confirmedDeviceId: string | null;
  userNote: string | null;
  frontImageUrl: string;
  backImageUrl: string | null;
  frontQuality: ImageQuality;
  backQuality: ImageQuality | null;
  createdAt: number;
  completedAt: number | null;
};

export type ScannerOverview = {
  cloudConfigured: boolean;
  model: string;
  catalog: HardwareDeviceDto[];
  scans: HardwareScanDto[];
};
