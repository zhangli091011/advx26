import type { ReactNode } from "react";
import "./pit.css";

export const metadata = { title: "PIT-OS 智能工具箱" };

export default function PitLayout({ children }: { children: ReactNode }) {
  return <div className="pit-root">{children}</div>;
}
