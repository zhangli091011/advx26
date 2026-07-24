"use client";

import { X } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

export function Avatar({
  name,
  src,
  className = "",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <span className={`avatar ${className}`} aria-label={`${name}的头像`}>
      {src ? <Image src={src} alt="" width={128} height={128} unoptimized /> : name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div>
        <div className="empty-state-icon">{icon}</div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function LoadingPanel() {
  return (
    <div className="panel panel-pad" style={{ minHeight: 340, display: "grid", gap: 16 }}>
      <div className="skeleton" style={{ width: "28%", height: 20 }} />
      <div className="skeleton" style={{ width: "72%", height: 42 }} />
      <div className="skeleton" style={{ width: "100%", height: 180 }} />
    </div>
  );
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({ error: "服务器响应异常" }));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "操作失败");
  return payload.data as T;
}
