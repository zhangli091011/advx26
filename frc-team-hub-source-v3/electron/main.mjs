import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import updater from "electron-updater";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { autoUpdater } = updater;
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let mainWindow;
let nextServer;
let nextServerError;
let nextServerOutput = "";
let updateCheckPromise;

function recordServerOutput(chunk) {
  nextServerOutput = `${nextServerOutput}${chunk}`.slice(-12000);
}

function serverFailure(message) {
  const details = nextServerOutput.trim();
  return new Error(details ? `${message}\n\n${details}` : message);
}
let updateTimer;

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (nextServerError) throw serverFailure(`内置服务启动失败：${nextServerError.message}`);
    if (nextServer?.exitCode !== null) {
      throw serverFailure(`内置服务意外退出，代码 ${nextServer?.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("内置服务启动超时");
}

async function startNextServer() {
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, "next-app")
    : path.join(__dirname, "..", "desktop", "next-app");
  const serverPath = path.join(serverRoot, "server.js");
  const runtimeModules = path.join(serverRoot, "runtime_modules");
  const nextPackage = path.join(runtimeModules, "next", "package.json");
  if (!fs.existsSync(serverPath) || !fs.existsSync(nextPackage)) {
    throw new Error(`桌面运行资源不完整，请重新安装应用。\n资源目录：${serverRoot}`);
  }
  const port = await findAvailablePort();

  nextServerError = undefined;
  nextServerOutput = "";

  nextServer = spawn(process.execPath, [serverPath], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_PATH: runtimeModules,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      PIT_MQTT_URL: process.env.PIT_MQTT_URL || "mqtt://127.0.0.1:1883",
    },
    stdio: "pipe",
    windowsHide: true,
  });

  nextServer.on("error", (error) => {
    nextServerError = error;
  });
  nextServer.stdout.on("data", (chunk) => {
    recordServerOutput(chunk);
    console.log(`[next] ${chunk}`);
  });
  nextServer.stderr.on("data", (chunk) => {
    recordServerOutput(chunk);
    console.error(`[next] ${chunk}`);
  });

  const url = `http://127.0.0.1:${port}/pit`;
  await waitForServer(url);
  return url;
}

async function createWindow() {
  const url = await startNextServer();

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#080a0b",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  await mainWindow.loadURL(url);
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] downloading version ${info.version}`);
  });
  autoUpdater.on("download-progress", (progress) => {
    console.log(`[updater] ${progress.percent.toFixed(1)}% downloaded`);
  });
  autoUpdater.on("error", (error) => {
    console.error("[updater] update failed", error);
  });
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "ADVX PIT OS 更新已就绪",
      message: `版本 ${info.version} 已下载完成`,
      detail: "立即重启可完成更新，也可以在下次退出程序时自动安装。",
      buttons: ["立即重启安装", "稍后安装"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response === 0) autoUpdater.quitAndInstall(false, true);
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[updater] check failed", error);
    });
  };

  setTimeout(check, 5000);
  updateTimer = setInterval(check, UPDATE_INTERVAL_MS);
  updateTimer.unref();
}

async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    return { status: "unavailable", message: "检查更新仅支持已安装的桌面客户端" };
  }

  if (updateCheckPromise) return updateCheckPromise;

  updateCheckPromise = autoUpdater.checkForUpdates()
    .then(async (result) => {
      const latestVersion = result?.updateInfo.version;
      if (result?.isUpdateAvailable && latestVersion) {
        await dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "发现新版本",
          message: `ADVX PIT OS ${latestVersion} 正在后台下载`,
          detail: "下载完成后会提示重启安装。",
          buttons: ["确定"],
        });
        return { status: "available", message: `正在下载 ${latestVersion}` };
      }

      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "检查更新",
        message: `当前已是最新版本 ${app.getVersion()}`,
        buttons: ["确定"],
      });
      return { status: "current", message: "已是最新版本" };
    })
    .catch(async (error) => {
      console.error("[updater] manual check failed", error);
      await dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "检查更新失败",
        message: "无法连接更新服务器",
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["确定"],
      });
      return { status: "error", message: "检查失败" };
    })
    .finally(() => {
      updateCheckPromise = undefined;
    });

  return updateCheckPromise;
}

ipcMain.handle("pit:check-for-updates", checkForUpdatesManually);

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady()
    .then(async () => {
      await createWindow();
      configureAutoUpdater();
    })
    .catch((error) => {
      dialog.showErrorBox("ADVX PIT OS 启动失败", String(error?.stack || error));
      app.quit();
    });
}

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => {
  if (updateTimer) clearInterval(updateTimer);
  if (nextServer && nextServer.exitCode === null) nextServer.kill();
});
