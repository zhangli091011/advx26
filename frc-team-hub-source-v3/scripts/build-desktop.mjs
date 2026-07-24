import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;

if (!npmCli || !fs.existsSync(npmCli)) {
  throw new Error("无法定位 npm CLI，请通过 npm run desktop:build 执行此脚本");
}

function run(args) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} 执行失败，退出码 ${result.status}`);
}

const packagePath = path.join(root, "package.json");
const previousVersion = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;

run(["version", "patch", "--no-git-tag-version"]);

const version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
console.log(`Desktop version bumped: ${previousVersion} -> ${version}`);

run(["run", "desktop:package"]);

const installer = path.join(root, "dist-desktop", `ADVX-PIT-OS-Setup-${version}.exe`);
if (!fs.existsSync(installer)) {
  throw new Error(`打包完成但未找到安装包：${installer}`);
}

console.log(`Desktop build ready: ${installer}`);
console.log("Upload was not started. Run npm run desktop:publish when ready.");
