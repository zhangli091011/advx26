import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "注册" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand"><span className="brand-mark">NX</span> NEXUS // FRC</div>
        <div className="auth-visual-copy">
          <div className="eyebrow">JOIN THE CREW</div>
          <h1>新的赛季，<br />从一条可靠的记录开始。</h1>
          <p>注册需要赛队邀请码，避免内部图纸和财务资料被无关人员访问。</p>
        </div>
        <div className="auth-tech-visual" aria-hidden="true">
          <span className="auth-tech-ring ring-one" />
          <span className="auth-tech-ring ring-two" />
          <span className="auth-tech-axis axis-x" />
          <span className="auth-tech-axis axis-y" />
          <span className="auth-tech-core">NX</span>
          <span className="auth-tech-caption mono">MEMBER / ACCESS NODE</span>
        </div>
        <div className="auth-coordinate mono">INVITE ONLY / MEMBER NODE</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card wide">
          <div className="eyebrow">MEMBER ENROLLMENT</div>
          <h2>创建赛队账号</h2>
          <p>邀请码由管理员提供。注册后可以打卡、查看图纸和参与工时排名。</p>
          <AuthForm mode="register" />
        </div>
      </section>
    </main>
  );
}
