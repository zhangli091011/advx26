"use client";

import { Camera, KeyRound, LoaderCircle, Save, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, PageHeader, fetchJson } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";
import { formatSeconds, roleLabel } from "@/lib/format";

type AttendanceSummary = {
  summary: { allSeconds: number; monthSeconds: number };
  records: unknown[];
};

type Ranking = {
  currentUserId: string;
  entries: Array<{ id: string; rank: number; totalSeconds: number; tasks: number }>;
};

export function ProfileClient({ initialUser }: { initialUser: SessionUser }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [stats, setStats] = useState({ totalSeconds: 0, monthSeconds: 0, tasks: 0, rank: 0 });
  const [profileStatus, setProfileStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [avatarStatus, setAvatarStatus] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchJson<AttendanceSummary>("/api/attendance"),
      fetchJson<Ranking>("/api/leaderboard?period=all"),
    ])
      .then(([attendance, ranking]) => {
        const me = ranking.entries.find((entry) => entry.id === ranking.currentUserId);
        setStats({
          totalSeconds: attendance.summary.allSeconds,
          monthSeconds: attendance.summary.monthSeconds,
          tasks: me?.tasks || attendance.records.length,
          rank: me?.rank || 0,
        });
      })
      .catch(() => null);
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileStatus("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await fetchJson<{ user: SessionUser }>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: form.get("displayName"), email: form.get("email") }),
      });
      setUser(data.user);
      setProfileStatus("个人资料已保存");
      router.refresh();
    } catch (err) {
      setProfileStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordStatus("");
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) {
      setPasswordStatus("两次输入的新密码不一致");
      setSavingPassword(false);
      return;
    }
    try {
      await fetchJson("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      event.currentTarget.reset();
      setPasswordStatus("密码已更新，其他旧会话已撤销");
    } catch (err) {
      setPasswordStatus(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSavingPassword(false);
    }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSavingAvatar(true);
    setAvatarStatus("");
    const form = new FormData();
    form.set("avatar", file);
    try {
      const data = await fetchJson<{ avatarUrl: string }>("/api/profile/avatar", { method: "POST", body: form });
      setUser((current) => ({ ...current, avatarUrl: data.avatarUrl }));
      setAvatarStatus("头像已更新并裁切为 512 × 512 WebP");
      router.refresh();
    } catch (err) {
      setAvatarStatus(err instanceof Error ? err.message : "头像上传失败");
    } finally {
      setSavingAvatar(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <PageHeader eyebrow="MEMBER PROFILE" title="个人资料与账号安全" description="管理队内昵称、邮箱、头像和登录密码；同时查看你在本赛季留下的贡献记录。" />

      <div className="profile-hero panel">
        <div className="profile-avatar-wrap">
          <Avatar name={user.displayName} src={user.avatarUrl} className="profile-avatar" />
          <label className="avatar-upload" title="更换头像">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} />
            {savingAvatar ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />}
          </label>
        </div>
        <div className="profile-identity">
          <span className="status-chip active">{roleLabel(user.role)}</span>
          <h1>{user.displayName}</h1>
          <p>@{user.username} · {user.email || "未设置邮箱"}</p>
          {avatarStatus ? <small>{avatarStatus}</small> : null}
        </div>
        <div className="profile-code mono">MEMBER NODE<br />{user.id.slice(0, 8).toUpperCase()}</div>
      </div>

      <div className="profile-stats">
        <article><Trophy size={17} /><span><small>赛季排名</small><strong>#{stats.rank || "—"}</strong></span></article>
        <article><UserRound size={17} /><span><small>完成任务</small><strong>{stats.tasks}</strong></span></article>
        <article><ShieldCheck size={17} /><span><small>本月工时</small><strong>{formatSeconds(stats.monthSeconds)}</strong></span></article>
        <article><KeyRound size={17} /><span><small>赛季工时</small><strong>{formatSeconds(stats.totalSeconds)}</strong></span></article>
      </div>

      <div className="profile-layout">
        <section className="panel panel-pad">
          <div className="panel-heading"><div><h2>基本资料</h2><p>这些信息会显示在排行榜和上传记录中</p></div></div>
          <form onSubmit={saveProfile}>
            <div className="form-grid">
              <div className="field"><label>用户名</label><input className="input mono" value={user.username} disabled /></div>
              <div className="field"><label htmlFor="display-name">队内昵称</label><input className="input" id="display-name" name="displayName" defaultValue={user.displayName} required /></div>
              <div className="field span-2"><label htmlFor="profile-email">邮箱</label><input className="input" id="profile-email" name="email" type="email" defaultValue={user.email || ""} placeholder="name@example.com" /></div>
            </div>
            {profileStatus ? <div className={`alert ${profileStatus.includes("已") ? "success" : "error"}`} style={{ marginTop: 14 }}>{profileStatus}</div> : null}
            <div className="form-actions"><button className="button primary" disabled={savingProfile}>{savingProfile ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{savingProfile ? "正在保存" : "保存资料"}</button></div>
          </form>
        </section>

        <section className="panel panel-pad">
          <div className="panel-heading"><div><h2>修改密码</h2><p>成功后撤销其他设备上的旧会话</p></div></div>
          <form onSubmit={changePassword}>
            <div className="field"><label htmlFor="current-password">当前密码</label><input className="input" id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div className="form-grid" style={{ marginTop: 14 }}>
              <div className="field"><label htmlFor="profile-new-password">新密码</label><input className="input" id="profile-new-password" name="newPassword" type="password" minLength={10} autoComplete="new-password" required /></div>
              <div className="field"><label htmlFor="profile-confirm-password">确认新密码</label><input className="input" id="profile-confirm-password" name="confirmPassword" type="password" minLength={10} autoComplete="new-password" required /></div>
            </div>
            {passwordStatus ? <div className={`alert ${passwordStatus.includes("已") ? "success" : "error"}`} style={{ marginTop: 14 }}>{passwordStatus}</div> : null}
            <div className="form-actions"><button className="button" disabled={savingPassword}>{savingPassword ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />}{savingPassword ? "正在更新" : "更新密码"}</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
