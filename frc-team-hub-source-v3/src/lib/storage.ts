import "server-only";

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dataRoot } from "@/lib/db";

export type StoragePurpose = "avatars" | "drawings" | "finance" | "hardware-scans";

function safeExtension(name: string) {
  return path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "");
}

export function safeDisplayName(name: string) {
  return path.basename(name).replace(/[\u0000-\u001f\u007f]/g, "_").slice(0, 180);
}

export async function saveUpload(file: File, purpose: StoragePurpose) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = safeExtension(file.name);
  const storageKey = `${purpose}/${randomUUID()}${ext}`;
  const fullPath = path.join(dataRoot, "storage", storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer, { flag: "wx" });
  return {
    storageKey,
    originalName: safeDisplayName(file.name),
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    buffer,
  };
}

export async function saveAvatar(file: File, userId: string) {
  const input = Buffer.from(await file.arrayBuffer());
  const output = await sharp(input, { limitInputPixels: 16_777_216 })
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 88 })
    .toBuffer();

  const storageKey = `avatars/${userId}-${randomUUID()}.webp`;
  const fullPath = path.join(dataRoot, "storage", storageKey);
  await fs.writeFile(fullPath, output, { flag: "wx" });
  return storageKey;
}

export async function saveHardwareScanImage(
  file: File,
  scanId: string,
  view: "front" | "back",
) {
  const input = Buffer.from(await file.arrayBuffer());
  const output = await sharp(input, { limitInputPixels: 33_554_432 })
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();

  const storageKey = "hardware-scans/" + scanId + "/" + view + ".webp";
  const fullPath = path.join(dataRoot, "storage", storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, output, { flag: "wx" });
  return {
    storageKey,
    mimeType: "image/webp",
    sizeBytes: output.length,
    sha256: createHash("sha256").update(output).digest("hex"),
    buffer: output,
  };
}

export async function readStorage(storageKey: string) {
  const root = path.resolve(dataRoot, "storage");
  const fullPath = path.resolve(root, storageKey);
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage key");
  return fs.readFile(fullPath);
}

export async function deleteStorage(storageKey: string | null | undefined) {
  if (!storageKey) return;
  try {
    const root = path.resolve(dataRoot, "storage");
    const fullPath = path.resolve(root, storageKey);
    if (!fullPath.startsWith(`${root}${path.sep}`)) return;
    await fs.unlink(fullPath);
  } catch {
    // Old avatars and failed uploads are safe to leave for the next cleanup pass.
  }
}
