import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Workspace } from "@/components/workspace";
import { Patients } from "@/components/patients";
import { AdminConflicts, AuditViewer } from "@/components/admin-tools";
export default async function Admin({
  params,
}: {
  params: { section: string };
}) {
  const { section } = params;
  const user = await currentUser();
  if (!user) redirect("/login");
  if (
    ![
      "pacientes",
      "conflictos",
      "bitacora",
      "jornadas",
      "pap",
      "impacto",
    ].includes(section)
  )
    notFound();
  if (
    (["conflictos", "bitacora", "impacto"].includes(section) &&
      user.role !== "admin") ||
    (section === "pacientes" && !can(user.role, "clinical_read")) ||
    (section === "pap" &&
      !["admin", "consulta_clinica", "laboratorio"].includes(user.role))
  )
    return (
      <div className="panel empty">
        <h1>Acceso restringido</h1>
        <p>Tu perfil no tiene permiso para consultar este módulo.</p>
      </div>
    );
  if (section === "pacientes") return <Patients />;
  if (section === "conflictos") return <AdminConflicts />;
  if (section === "bitacora") return <AuditViewer />;
  const entries =
    section === "bitacora"
      ? db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").all()
      : section === "conflictos"
        ? db
            .prepare(
              "SELECT * FROM conflicts ORDER BY created_at DESC LIMIT 100",
            )
            .all()
        : [];
  return <Workspace section={section} user={user} entries={entries} />;
}
