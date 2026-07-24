import { redirect } from "next/navigation";
import { ProfileClient } from "@/components/profile-client";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "个人资料" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ProfileClient initialUser={user} />;
}
