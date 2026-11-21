import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Campo } from "@/components/campo";
export default async function CampoPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!["captura", "admin"].includes(user.role)) redirect("/admin/jornadas");
  return <Campo />;
}
