import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ClinicalForm } from "@/components/clinical-form";
export default async function FormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; attentionId: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id, attentionId } = await params;
  const { tipo } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "clinical_read")) redirect("/admin/jornadas");
  return (
    <ClinicalForm
      patientId={id}
      attentionId={attentionId}
      kind={tipo || "mamaria"}
      user={user}
    />
  );
}
