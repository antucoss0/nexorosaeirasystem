import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Dashboard } from "@/components/admin-tools";
export default async function AdminHome() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/admin/jornadas");
  return <Dashboard />;
}
