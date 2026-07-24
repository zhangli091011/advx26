import "server-only";

import sharp from "sharp";
import type {
  HardwareCandidate,
  HardwareCategory,
  HardwareDeviceDto,
  HardwareScanDto,
  ImageQuality,
  ObservedText,
  VisionGuess,
} from "@/lib/hardware-types";

export type DeviceRow = {
  id: string;
  manufacturer: string;
  model: string;
  category: string;
  part_number: string | null;
  revision: string | null;
  voltage_summary: string | null;
  protocols_json: string;
  interfaces_json: string;
  description: string | null;
  source_url: string | null;
  usage_url: string | null;
  pinout_url: string | null;
};

export type ScanRow = {
  id: string;
  status: HardwareScanDto["status"];
  provider: string;
  provider_model: string | null;
  summary: string;
  observed_text_json: string;
  visual_guess_json: string;
  candidates_json: string;
  confirmed_device_id: string | null;
  user_note: string | null;
  front_quality_json: string;
  back_quality_json: string | null;
  back_storage_key: string | null;
  created_at: number;
  completed_at: number | null;
};

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapDeviceRow(row: DeviceRow): HardwareDeviceDto {
  return {
    id: row.id,
    manufacturer: row.manufacturer,
    model: row.model,
    category: row.category as HardwareCategory,
    partNumber: row.part_number,
    revision: row.revision,
    voltageSummary: row.voltage_summary,
    protocols: parseJson<string[]>(row.protocols_json, []),
    interfaces: parseJson<string[]>(row.interfaces_json, []),
    description: row.description,
    sourceUrl: row.source_url,
    usageUrl: row.usage_url,
    pinoutUrl: row.pinout_url,
  };
}

export function serializeScanRow(row: ScanRow): HardwareScanDto {
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    providerModel: row.provider_model,
    summary: row.summary,
    observedTexts: parseJson<ObservedText[]>(row.observed_text_json, []),
    visualGuess: parseJson<VisionGuess>(row.visual_guess_json, {
      manufacturer: null,
      model: null,
      category: "UNKNOWN",
      partNumber: null,
      revision: null,
      visibleInterfaces: [],
      possibleProtocols: [],
      confidence: 0,
      warnings: [],
    }),
    candidates: parseJson<HardwareCandidate[]>(row.candidates_json, []),
    confirmedDeviceId: row.confirmed_device_id,
    userNote: row.user_note,
    frontImageUrl: "/api/hardware-scans/" + row.id + "/image/front",
    backImageUrl: row.back_storage_key
      ? "/api/hardware-scans/" + row.id + "/image/back"
      : null,
    frontQuality: parseJson<ImageQuality>(row.front_quality_json, emptyQuality()),
    backQuality: row.back_quality_json
      ? parseJson<ImageQuality>(row.back_quality_json, emptyQuality())
      : null,
    createdAt: Number(row.created_at),
    completedAt: row.completed_at ? Number(row.completed_at) : null,
  };
}

function emptyQuality(): ImageQuality {
  return {
    accepted: false,
    score: 0,
    width: 0,
    height: 0,
    brightness: 0,
    contrast: 0,
    edgeScore: 0,
    brightRatio: 0,
    darkRatio: 0,
    issues: [],
  };
}

export async function analyzeImageQuality(input: Buffer): Promise<ImageQuality> {
  const image = sharp(input, { limitInputPixels: 33_554_432 }).rotate();
  const metadata = await image.metadata();
  const output = await image
    .clone()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = output.data;
  const info = output.info;

  let sum = 0;
  let sumSquares = 0;
  let bright = 0;
  let dark = 0;
  let edgeSum = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = y * info.width + x;
      const value = data[index];
      sum += value;
      sumSquares += value * value;
      if (value >= 245) bright += 1;
      if (value <= 18) dark += 1;
      if (x > 0) edgeSum += Math.abs(value - data[index - 1]);
      if (y > 0) edgeSum += Math.abs(value - data[index - info.width]);
    }
  }

  const pixels = Math.max(data.length, 1);
  const brightness = sum / pixels;
  const variance = Math.max(sumSquares / pixels - brightness * brightness, 0);
  const contrast = Math.sqrt(variance);
  const comparisons = Math.max((info.width - 1) * info.height + (info.height - 1) * info.width, 1);
  const edgeScore = edgeSum / comparisons;
  const brightRatio = bright / pixels;
  const darkRatio = dark / pixels;
  const issues: ImageQuality["issues"] = [];
  const width = metadata.width || info.width;
  const height = metadata.height || info.height;

  if (width < 900 || height < 700) {
    issues.push({ code: "TOO_SMALL", message: "图片分辨率偏低，请靠近硬件或拍摄局部特写。" });
  }
  if (edgeScore < 5.5) {
    issues.push({ code: "BLURRY", message: "图片可能失焦或抖动，请稳定相机后重拍。" });
  }
  if (brightness < 48 || darkRatio > 0.58) {
    issues.push({ code: "UNDEREXPOSED", message: "画面偏暗，请增加补光。" });
  }
  if (brightness > 218 || brightRatio > 0.34) {
    issues.push({ code: "OVEREXPOSED", message: "高亮区域过多，请降低曝光或改变补光角度。" });
  }
  if (contrast < 22) {
    issues.push({ code: "LOW_CONTRAST", message: "文字与背景对比不足，请调整光线或背景。" });
  }

  const penalty = Math.min(issues.length * 0.18, 0.8);
  return {
    accepted: !issues.some((issue) =>
      ["BLURRY", "OVEREXPOSED", "UNDEREXPOSED", "TOO_SMALL"].includes(issue.code),
    ),
    score: Number(Math.max(0, 1 - penalty).toFixed(2)),
    width,
    height,
    brightness: Number(brightness.toFixed(1)),
    contrast: Number(contrast.toFixed(1)),
    edgeScore: Number(edgeScore.toFixed(1)),
    brightRatio: Number(brightRatio.toFixed(3)),
    darkRatio: Number(darkRatio.toFixed(3)),
    issues,
  };
}

export function normalizeHardwareText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function tokenOverlap(a: string, b: string) {
  const left = new Set(normalizeHardwareText(a).split(" ").filter(Boolean));
  const right = new Set(normalizeHardwareText(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

export function matchHardwareDevices(
  devices: HardwareDeviceDto[],
  aliases: Map<string, string[]>,
  observedTexts: ObservedText[],
  guess: VisionGuess,
  hint: string,
) {
  const evidenceText = [
    hint,
    guess.manufacturer || "",
    guess.model || "",
    guess.partNumber || "",
    guess.revision || "",
    ...observedTexts.map((item) => item.text),
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedEvidence = normalizeHardwareText(evidenceText);

  return devices
    .map<HardwareCandidate>((device) => {
      let score = 0;
      const reasons: string[] = [];
      const manufacturer = normalizeHardwareText(device.manufacturer);
      const model = normalizeHardwareText(device.model);
      const partNumber = normalizeHardwareText(device.partNumber || "");

      if (model && normalizedEvidence.includes(model)) {
        score += 0.52;
        reasons.push("型号文字匹配：" + device.model);
      } else {
        const overlap = tokenOverlap(evidenceText, device.model);
        if (overlap >= 0.5) {
          score += 0.28 * overlap;
          reasons.push("型号关键词相似：" + device.model);
        }
      }
      if (partNumber && normalizedEvidence.includes(partNumber)) {
        score += 0.28;
        reasons.push("产品编号匹配：" + device.partNumber);
      }
      if (manufacturer && normalizedEvidence.includes(manufacturer)) {
        score += 0.12;
        reasons.push("厂商文字匹配：" + device.manufacturer);
      }
      if (guess.category !== "UNKNOWN" && guess.category === device.category) {
        score += 0.05;
        reasons.push("设备类别一致");
      }
      for (const alias of aliases.get(device.id) || []) {
        const normalizedAlias = normalizeHardwareText(alias);
        if (normalizedAlias.length >= 3 && normalizedEvidence.includes(normalizedAlias)) {
          score += 0.18;
          reasons.push("别名匹配：" + alias);
          break;
        }
      }
      return {
        device,
        score: Number(Math.min(score, 1).toFixed(2)),
        reasons: [...new Set(reasons)].slice(0, 4),
      };
    })
    .filter((candidate) => candidate.score > 0.04)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
