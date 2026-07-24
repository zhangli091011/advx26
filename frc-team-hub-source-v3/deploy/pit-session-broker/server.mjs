import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MiCloud = require("homebridge-miot/lib/protocol/MiCloud.js");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 18765);
const SESSION_FILE = process.env.SESSION_FILE || "/var/lib/pit-session-broker/session.json";
const CREDENTIALS_FILE = process.env.CREDENTIALS_FILE || "/var/lib/pit-session-broker/credentials.json";
const API_KEY = required("PIT_SESSION_API_KEY");
const REFRESH_MS = Math.max(60 * 60 * 1000, Number(process.env.SESSION_REFRESH_MS || 6 * 60 * 60 * 1000));

const logger = { debug() {}, deepDebug() {} };
let session = loadSession();
let credentials = loadCredentials();
let lastValidatedAt = 0;
let lastError = "";
let refreshPromise = null;
let twoFactorUrl = "";

async function refreshSession(forceLogin = false) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const cloud = new MiCloud(logger);
    cloud.setCountry(credentials.region || "cn");
    cloud.setRequestTimeout(15_000);

    if (session && !forceLogin) {
      cloud.setServiceToken(session);
      try {
        await cloud.getDevices();
        lastValidatedAt = Date.now();
        lastError = "";
        return session;
      } catch {
        // The cached token is invalid; continue with a fresh login.
      }
    }

    if (!credentials.username || !credentials.password) throw new Error("缺少小米云账号或密码，无法刷新 session");
    try {
      await cloud.login(credentials.username, credentials.password);
    } catch (error) {
      if (typeof error?.notificationUrl === "string") twoFactorUrl = error.notificationUrl;
      throw error;
    }
    await cloud.getDevices();
    const next = cloud.getServiceToken();
    if (!validSession(next)) throw new Error("小米云登录未返回有效 session");
    session = next;
    lastValidatedAt = Date.now();
    lastError = "";
    saveSession(next);
    return next;
  })().catch((error) => {
    lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

const server = http.createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.url === "/health" && request.method === "GET") {
    return json(response, 200, {
      ok: true,
      hasSession: Boolean(session),
      lastValidatedAt: lastValidatedAt || null,
      lastError: lastError || null,
    });
  }

  if (request.url === "/v1/session" && request.method === "GET") {
    try {
      if (!session || Date.now() - lastValidatedAt > REFRESH_MS) await refreshSession();
      return json(response, 200, { ok: true, session, refreshedAt: lastValidatedAt });
    } catch (error) {
      return json(response, 503, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!authorized(request.headers.authorization)) return json(response, 401, { ok: false, error: "unauthorized" });

  if (request.url === "/v1/refresh" && request.method === "POST") {
    try {
      await refreshSession(true);
      return json(response, 200, { ok: true, refreshedAt: lastValidatedAt });
    } catch (error) {
      return json(response, 503, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (request.url === "/v1/credentials" && request.method === "POST") {
    try {
      const body = await readJson(request);
      if (typeof body.username !== "string" || !body.username.trim()
        || typeof body.password !== "string" || !body.password
        || typeof body.region !== "string") {
        return json(response, 400, { ok: false, error: "invalid_credentials" });
      }
      credentials = { username: body.username.trim(), password: body.password, region: body.region };
      savePrivateJson(CREDENTIALS_FILE, credentials);
      await refreshSession(true);
      return json(response, 200, { ok: true, refreshedAt: lastValidatedAt });
    } catch (error) {
      return json(response, 503, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (request.url === "/v1/2fa" && request.method === "POST") {
    try {
      const body = await readJson(request);
      if (typeof body.ticket !== "string" || !body.ticket.trim()) {
        return json(response, 400, { ok: false, error: "invalid_ticket" });
      }
      if (typeof body.verifyUrl === "string" && body.verifyUrl) twoFactorUrl = body.verifyUrl;
      if (!twoFactorUrl) {
        try {
          await refreshSession(true);
        } catch {
          // A password login populates the current two-factor challenge URL.
        }
      }
      if (!twoFactorUrl) return json(response, 409, { ok: false, error: "two_factor_challenge_missing" });

      const cloud = new MiCloud(logger);
      cloud.setCountry(credentials.region || "cn");
      cloud.setRequestTimeout(15_000);
      await cloud.loginTwoFa(twoFactorUrl, body.ticket.trim());
      await cloud.getDevices();
      const next = cloud.getServiceToken();
      if (!validSession(next)) throw new Error("小米云二次验证未返回有效 session");
      session = next;
      lastValidatedAt = Date.now();
      lastError = "";
      twoFactorUrl = "";
      saveSession(next);
      return json(response, 200, { ok: true, refreshedAt: lastValidatedAt });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      return json(response, 503, { ok: false, error: lastError });
    }
  }

  if (request.url === "/v1/session/import" && request.method === "POST") {
    try {
      const body = await readJson(request);
      if (!validSession(body.session)) return json(response, 400, { ok: false, error: "invalid_session" });
      session = body.session;
      savePrivateJson(SESSION_FILE, session);
      lastValidatedAt = 0;
      await refreshSession(false);
      return json(response, 200, { ok: true, refreshedAt: lastValidatedAt });
    } catch (error) {
      return json(response, 503, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return json(response, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`pit-session-broker listening on ${HOST}:${PORT}`);
  void refreshSession().catch((error) => console.error(`initial refresh failed: ${error.message}`));
});

const timer = setInterval(() => {
  void refreshSession(true).catch((error) => console.error(`scheduled refresh failed: ${error.message}`));
}, REFRESH_MS);
timer.unref();

function authorized(header) {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(API_KEY);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function loadSession() {
  try {
    const value = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    return validSession(value) ? value : null;
  } catch {
    return null;
  }
}

function loadCredentials() {
  try {
    const value = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
    return value && typeof value.username === "string" && typeof value.password === "string"
      ? value
      : { username: "", password: "", region: "cn" };
  } catch {
    return { username: "", password: "", region: "cn" };
  }
}

function saveSession(value) {
  savePrivateJson(SESSION_FILE, value);
}

function savePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16 * 1024) request.destroy(new Error("request_too_large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function validSession(value) {
  return value && typeof value.ssecurity === "string"
    && typeof value.userId === "string"
    && typeof value.serviceToken === "string";
}

function json(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
