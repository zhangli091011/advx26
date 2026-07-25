import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const destination = path.join(root, "dist-pi", "pit-os");

if (process.platform !== "linux" || process.arch !== "arm64") {
  throw new Error("Pi releases must be built on Linux ARM64 so native dependencies match Raspberry Pi OS");
}
if (process.env.NEXT_PUBLIC_PIT_DEVICE_PROFILE !== "pi5") {
  throw new Error("Set NEXT_PUBLIC_PIT_DEVICE_PROFILE=pi5 before running npm run pi:build");
}
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error("Missing .next/standalone/server.js; run npm run build first");
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(standalone, destination, { recursive: true, dereference: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(destination, ".next", "static"), {
  recursive: true,
});
fs.cpSync(path.join(root, "deploy", "pi", "device-gateway.mjs"), path.join(destination, "device-gateway.mjs"));
fs.mkdirSync(path.join(destination, "hardware", "scripts"), { recursive: true });
fs.cpSync(path.join(root, "hardware", "scripts", "vision-scan.py"), path.join(destination, "hardware", "scripts", "vision-scan.py"));
fs.mkdirSync(path.join(destination, "deploy", "pi"), { recursive: true });
for (const file of ["mediamtx.yml", "pit-media.service", "THIRD_PARTY_NOTICES.md"]) {
  fs.cpSync(path.join(root, "deploy", "pi", file), path.join(destination, "deploy", "pi", file));
}
fs.cpSync(path.join(root, "node_modules", "ws"), path.join(destination, "node_modules", "ws"), {
  recursive: true,
  dereference: true,
});

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(destination, "public"), { recursive: true });
}

for (const entry of fs.readdirSync(destination)) {
  if (entry === "data" || entry === ".env" || entry.startsWith(".env.")) {
    fs.rmSync(path.join(destination, entry), { recursive: true, force: true });
  }
}

const manifest = {
  name: "pit-os-pi",
  version: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version,
  platform: process.platform,
  arch: process.arch,
  deviceProfile: process.env.NEXT_PUBLIC_PIT_DEVICE_PROFILE,
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(destination, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Pi release prepared at ${destination}`);
