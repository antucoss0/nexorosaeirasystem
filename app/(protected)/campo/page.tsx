import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Workspace } from "@/components/workspace";
export default async function Campo() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!["captura", "admin"].includes(user.role)) redirect("/admin/jornadas");
  return <Workspace section="campo" user={user} />;
}
