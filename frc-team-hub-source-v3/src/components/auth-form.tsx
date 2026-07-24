"use client";

import { ArrowRight, KeyRound, LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchJson } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    login: "captain",
    username: "",
    displayName: "",
    email: "",
    password: mode === "login" ? "FRC2026!Demo" : "",
    confirmPassword: "",
    inviteCode: "",
  });

  function update(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetchJson(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { login: values.login, password: values.password }
            : {
                username: values.username,
                displayName: values.displayName,
                email: values.email,
                password: values.password,
                confirmPassword: values.confirmPassword,
                inviteCode: values.inviteCode,
              },
        ),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === "login" ? (
        <>
          <div className="field">
            <label htmlFor="login">用户名或邮箱</label>
            <input
              className="input"
              id="login"
              autoComplete="username"
              value={values.login}
              onChange={(event) => update("login", event.target.value)}
              placeholder="captain"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <input
              className="input"
              id="password"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => update("password", event.target.value)}
              required
            />
          </div>
          <div className="demo-credentials">
            <span>演示管理员</span>
            <code>captain / FRC2026!Demo</code>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="username">用户名</label>
              <input
                className="input"
                id="username"
                autoComplete="username"
                value={values.username}
                onChange={(event) => update("username", event.target.value)}
                placeholder="george.gao"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="displayName">队内昵称</label>
              <input
                className="input"
                id="displayName"
                value={values.displayName}
                onChange={(event) => update("displayName", event.target.value)}
                placeholder="机械组 · 小高"
                required
              />
            </div>
            <div className="field span-2">
              <label htmlFor="email">邮箱（可选）</label>
              <input
                className="input"
                id="email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">密码</label>
              <input
                className="input"
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(event) => update("password", event.target.value)}
                minLength={10}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">确认密码</label>
              <input
                className="input"
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={(event) => update("confirmPassword", event.target.value)}
                required
              />
            </div>
            <div className="field span-2">
              <label htmlFor="invite-code">赛队邀请码</label>
              <input
                className="input"
                id="invite-code"
                value={values.inviteCode}
                onChange={(event) => update("inviteCode", event.target.value)}
                placeholder="由管理员提供；演示环境为 FRC2026"
                required
              />
            </div>
          </div>
        </>
      )}

      {error ? <div className="alert error">{error}</div> : null}

      <button className="button primary large full" type="submit" disabled={loading}>
        {loading ? (
          <LoaderCircle size={17} className="spin" />
        ) : mode === "login" ? (
          <KeyRound size={17} />
        ) : (
          <UserPlus size={17} />
        )}
        {loading ? "正在验证" : mode === "login" ? "进入工作台" : "创建赛队账号"}
        {!loading ? <ArrowRight size={16} /> : null}
      </button>

      <div className="auth-switch">
        {mode === "login" ? "还没有账号？" : "已经有账号？"}
        <Link href={mode === "login" ? "/register" : "/login"}>
          {mode === "login" ? "使用邀请码注册" : "返回登录"}
        </Link>
      </div>

      <div className="auth-security">
        <ShieldCheck size={14} />
        密码经哈希保存，会话使用 HttpOnly Cookie；仓库文件不会暴露在公开目录。
      </div>
    </form>
  );
}
