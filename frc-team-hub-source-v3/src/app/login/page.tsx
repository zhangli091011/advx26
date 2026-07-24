import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "登录" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand"><span className="brand-mark">NX</span> NEXUS // FRC</div>
        <div className="auth-visual-copy">
          <div className="eyebrow">TEAM OPERATIONS SYSTEM</div>
          <h1>把每一次制造、调试与采购，<br />都留在赛队的共同记忆里。</h1>
          <p>打卡、工时、STEP 图纸和财务资料，在一个克制、可靠的队内工作台中完成。</p>
        </div>
        <div className="auth-tech-visual" aria-hidden="true">
          <span className="auth-tech-ring ring-one" />
          <span className="auth-tech-ring ring-two" />
          <span className="auth-tech-axis axis-x" />
          <span className="auth-tech-axis axis-y" />
          <span className="auth-tech-core">NX</span>
          <span className="auth-tech-caption mono">ROBOTICS / OPERATIONS</span>
        </div>
        <div className="auth-coordinate mono">SYS.01 / SHANGHAI / ONLINE</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="eyebrow">SECURE ACCESS</div>
          <h2>欢迎回来</h2>
          <p>登录你的赛队账号，继续今天的任务。</p>
          <AuthForm mode="login" />
        </div>
      </section>
    </main>
  );
}
