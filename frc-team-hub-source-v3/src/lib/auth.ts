import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import db from "@/lib/db";

export const SESSION_COOKIE = "frc_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 14;

export type SessionUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: "MEMBER" | "ENGINEER" | "FINANCE" | "ADMIN";
  avatarUrl: string | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  const row = db
    .prepare(`
      SELECT u.id, u.username, u.email, u.display_name, u.role, u.avatar_path
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `)
    .get(hashToken(token), Date.now()) as
    | {
        id: string;
        username: string;
        email: string | null;
        display_name: string;
        role: SessionUser["role"];
        avatar_path: string | null;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: row.avatar_path ? `/api/avatar/${row.id}` : null,
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + SESSION_AGE_SECONDS * 1000;

  db.prepare(`
    INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), hashToken(token), userId, expiresAt, now);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
    priority: "high",
  });
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  store.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  (await cookies()).delete(SESSION_COOKIE);
}

export function hasRole(user: SessionUser, roles: SessionUser["role"][]) {
  return roles.includes(user.role);
}
