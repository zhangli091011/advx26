import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist-desktop");
const host = process.env.PIT_UPDATE_SSH_HOST || "82.158.229.157";
const remoteDir = process.env.PIT_UPDATE_REMOTE_DIR || "/www/server/nginx/html/updates";
const metadataPath = path.join(output, "latest.yml");

if (!fs.existsSync(metadataPath)) {
  throw new Error("缺少 latest.yml，请先运行 npm run desktop:build");
}

const metadata = fs.readFileSync(metadataPath, "utf8");
const installerName = metadata.match(/^path:\s*(.+)$/m)?.[1]?.trim();
if (!installerName || path.basename(installerName) !== installerName) {
  throw new Error("latest.yml 中缺少有效的安装包路径");
}

const artifacts = ["latest.yml", installerName, `${installerName}.blockmap`];
for (const name of artifacts) {
  if (!fs.existsSync(path.join(output, name))) {
    throw new Error(`缺少 ${name}，请重新运行 npm run desktop:build`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 执行失败，退出码 ${result.status}`);
}

run("ssh", [host, "install", "-d", "-m", "0755", remoteDir]);
run("scp", [
  ...artifacts.map((name) => path.join(output, name)),
  `${host}:${remoteDir}/`,
]);

console.log(`Published ${artifacts.length} OTA files to ${host}:${remoteDir}`);
