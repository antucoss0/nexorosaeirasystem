import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ClinicalForm } from "@/components/clinical-form";
export default async function FormPage({
  params,
  searchParams,
}: {
  params: { id: string; attentionId: string };
  searchParams: { tipo?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "clinical_read")) redirect("/admin/jornadas");
  return (
    <ClinicalForm
      patientId={params.id}
      attentionId={params.attentionId}
      kind={searchParams.tipo || "mamaria"}
      user={user}
    />
  );
}
