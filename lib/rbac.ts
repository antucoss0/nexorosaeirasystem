export type Role =
  | "captura"
  | "consulta_clinica"
  | "laboratorio"
  | "municipio"
  | "admin";
export type User = {
  id: string;
  email: string;
  nombre: string;
  role: Role;
  municipio: string | null;
};
export const permissions = {
  patient_write: ["captura", "admin"],
  attention_write: ["captura", "consulta_clinica", "admin"],
  jornada_write: ["municipio", "admin"],
  approve_requirements: ["admin"],
  authorize_pap: ["consulta_clinica"],
  upload_pdf: ["laboratorio"],
  audit_read: ["admin"],
  conflict_read: ["admin"],
  clinical_read: ["captura", "consulta_clinica", "laboratorio", "admin"],
} satisfies Record<string, Role[]>;
export function can(role: Role, action: keyof typeof permissions) {
  return (permissions[action] as Role[]).includes(role);
}
export const roleLabels: Record<Role, string> = {
  captura: "Brigadista",
  consulta_clinica: "Médico",
  laboratorio: "Laboratorio",
  municipio: "Enlace Municipal",
  admin: "Administración EIRA",
};
