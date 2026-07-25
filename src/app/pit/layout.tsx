import type { ReactNode } from "react";
import { PitViewport } from "@/components/pit/pit-viewport";
import "./pit.css";

export const metadata = { title: "PIT-OS 智能工具箱" };

export default function PitLayout({ children }: { children: ReactNode }) {
  return <PitViewport>{children}</PitViewport>;
}
