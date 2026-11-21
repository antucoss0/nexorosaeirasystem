import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PatientFicha } from "@/components/patients";
export default async function Ficha({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "clinical_read")) redirect("/admin/jornadas");
  return <PatientFicha id={id} user={user} />;
}
