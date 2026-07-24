import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const destination = path.join(root, "desktop", "next-app");

function materializeLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const stats = fs.lstatSync(entryPath);
    if (stats.isSymbolicLink()) {
      const target = fs.realpathSync(entryPath);
      fs.rmSync(entryPath, { recursive: true, force: true });
      fs.cpSync(target, entryPath, { recursive: true, dereference: true });
    } else if (stats.isDirectory()) {
      materializeLinks(entryPath);
    }
  }
}

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error("未找到 .next/standalone/server.js，请先运行 npm run build");
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
// Dereference Next's traced dependency links so the package never points back
// to the build machine after installation.
fs.cpSync(standalone, destination, { recursive: true, dereference: true });
materializeLinks(destination);
fs.cpSync(path.join(root, ".next", "static"), path.join(destination, ".next", "static"), {
  recursive: true,
});

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(destination, "public"), { recursive: true });
}

// electron-builder treats any directory named node_modules as application
// dependencies and filters it from extraResources. Keep the standalone
// dependency closure under an opaque name and expose it through NODE_PATH.
const nodeModules = path.join(destination, "node_modules");
const runtimeModules = path.join(destination, "runtime_modules");
if (!fs.existsSync(path.join(nodeModules, "next", "package.json"))) {
  throw new Error("standalone 构建缺少 next 运行时依赖");
}
fs.renameSync(nodeModules, runtimeModules);

if (!fs.existsSync(path.join(runtimeModules, "next", "package.json"))) {
  throw new Error("桌面运行时依赖准备失败");
}

console.log(`Desktop server prepared at ${destination}`);
