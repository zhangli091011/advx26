import "server-only";

import { z } from "zod";
import { hardwareCategories, type HardwareDeviceDto, type ObservedText, type VisionGuess } from "@/lib/hardware-types";

const observationSchema = z.object({
  text: z.string().trim().min(1).max(160),
  type: z.enum([
    "MANUFACTURER",
    "MODEL",
    "PART_NUMBER",
    "REVISION",
    "CHIP_MARKING",
    "INTERFACE_LABEL",
    "VOLTAGE_TEXT",
    "OTHER",
  ]),
  confidence: z.number().min(0).max(1),
});

const visionPayloadSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  observedTexts: z.array(observationSchema).max(40),
  guess: z.object({
    manufacturer: z.string().trim().max(120).nullable(),
    model: z.string().trim().max(160).nullable(),
    category: z.enum(hardwareCategories),
    partNumber: z.string().trim().max(120).nullable(),
    revision: z.string().trim().max(80).nullable(),
    visibleInterfaces: z.array(z.string().trim().max(80)).max(20),
    possibleProtocols: z.array(z.string().trim().max(80)).max(12),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().max(240)).max(12),
  }),
});

export type VisionIdentification = {
  provider: "OPENAI" | "OPENAI_COMPATIBLE" | "LOCAL_FALLBACK" | "CLOUD_ERROR_FALLBACK";
  model: string | null;
  summary: string;
  observedTexts: ObservedText[];
  guess: VisionGuess;
};

export function getVisionModel() {
  return process.env.OPENAI_VISION_MODEL?.trim() || "gpt-5.6";
}

export function getVisionApiBaseUrl() {
  return (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function getCloudProvider(): VisionIdentification["provider"] {
  try {
    return new URL(getVisionApiBaseUrl()).hostname === "api.openai.com"
      ? "OPENAI"
      : "OPENAI_COMPATIBLE";
  } catch {
    return "OPENAI_COMPATIBLE";
  }
}

export function isCloudVisionConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function fallbackResult(hint: string, reason?: string): VisionIdentification {
  const cleanedHint = hint.trim().slice(0, 500);
  const observedTexts: ObservedText[] = cleanedHint
    ? [{ text: cleanedHint, type: "OTHER", confidence: 1 }]
    : [];
  return {
    provider: reason ? "CLOUD_ERROR_FALLBACK" : "LOCAL_FALLBACK",
    model: null,
    summary: reason
      ? "云端识别暂时不可用，已保留图片并使用人工提示匹配本地设备目录。"
      : "尚未配置云端识别密钥。当前已完成图像质量检查，并使用人工提示匹配本地设备目录。",
    observedTexts,
    guess: {
      manufacturer: null,
      model: cleanedHint || null,
      category: "UNKNOWN",
      partNumber: null,
      revision: null,
      visibleInterfaces: [],
      possibleProtocols: [],
      confidence: cleanedHint ? 0.2 : 0,
      warnings: [
        reason || "云端视觉服务未配置，当前结果不包含图片 OCR。",
        "协议、电压和引脚必须以已审核设备档案为准。",
      ],
    },
  };
}

function buildCatalogContext(devices: HardwareDeviceDto[]) {
  return devices.slice(0, 80).map((device) => ({
    id: device.id,
    manufacturer: device.manufacturer,
    model: device.model,
    partNumber: device.partNumber,
    category: device.category,
  }));
}

function toDataUrl(buffer: Buffer) {
  return "data:image/webp;base64," + buffer.toString("base64");
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

export async function identifyHardwareWithVision(input: {
  front: Buffer;
  back?: Buffer | null;
  hint: string;
  devices: HardwareDeviceDto[];
}): Promise<VisionIdentification> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fallbackResult(input.hint);

  const model = getVisionModel();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "observedTexts", "guess"],
    properties: {
      summary: { type: "string" },
      observedTexts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "type", "confidence"],
          properties: {
            text: { type: "string" },
            type: {
              type: "string",
              enum: [
                "MANUFACTURER",
                "MODEL",
                "PART_NUMBER",
                "REVISION",
                "CHIP_MARKING",
                "INTERFACE_LABEL",
                "VOLTAGE_TEXT",
                "OTHER",
              ],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      guess: {
        type: "object",
        additionalProperties: false,
        required: [
          "manufacturer",
          "model",
          "category",
          "partNumber",
          "revision",
          "visibleInterfaces",
          "possibleProtocols",
          "confidence",
          "warnings",
        ],
        properties: {
          manufacturer: { type: ["string", "null"] },
          model: { type: ["string", "null"] },
          category: { type: "string", enum: [...hardwareCategories] },
          partNumber: { type: ["string", "null"] },
          revision: { type: ["string", "null"] },
          visibleInterfaces: { type: "array", items: { type: "string" } },
          possibleProtocols: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          warnings: { type: "array", items: { type: "string" } },
        },
      },
    },
  };

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: [
        "识别图片中的 FRC 机器人硬件。只报告图片中可见的文字与接口。",
        "不要把接口外形推断成确定的电压、极性、协议或引脚。",
        "possibleProtocols 只能填写可能性，并在 warnings 中说明需要文档或电气测量确认。",
        "若无法可靠识别，model 必须为 null，category 使用 UNKNOWN。",
        "用户提示：" + (input.hint.trim() || "无"),
        "团队本地候选目录：" + JSON.stringify(buildCatalogContext(input.devices)),
      ].join("\n"),
    },
    { type: "input_image", image_url: toDataUrl(input.front), detail: "high" },
  ];
  if (input.back) {
    content.push({ type: "input_image", image_url: toDataUrl(input.back), detail: "high" });
  }

  try {
    const response = await fetch(getVisionApiBaseUrl() + "/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions:
          "你是 FRC 维修区的硬件视觉记录器。区分可见观察、型号候选和经过资料库确认的事实。输出必须使用给定 JSON Schema。",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "hardware_identification",
            strict: true,
            schema,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const safeReason = response.status === 401
        ? "云端凭据无效或未授权。"
        : "云端服务返回 HTTP " + response.status + "。";
      return fallbackResult(input.hint, safeReason);
    }

    const payload = (await response.json()) as unknown;
    const outputText = extractOutputText(payload);
    if (!outputText) return fallbackResult(input.hint, "云端响应不包含结构化识别结果。");
    const parsed = visionPayloadSchema.safeParse(JSON.parse(outputText));
    if (!parsed.success) return fallbackResult(input.hint, "云端识别结果未通过结构校验。");

    return {
      provider: getCloudProvider(),
      model,
      summary: parsed.data.summary,
      observedTexts: parsed.data.observedTexts,
      guess: parsed.data.guess,
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError"
      ? "云端识别超时。"
      : "云端识别请求失败。";
    return fallbackResult(input.hint, reason);
  }
}
