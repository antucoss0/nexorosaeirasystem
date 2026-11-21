"use client";
import { ChangeRequestLink } from "./change-request-link";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  ClipboardList,
  GitCompareArrows,
  CalendarDays,
  FileHeart,
  ChartNoAxesCombined,
  LogOut,
  ArrowUpRight,
  HeartHandshake,
} from "lucide-react";
import { Connectivity, useConnectivity } from "./connectivity";
import { type User, roleLabels } from "@/lib/rbac";
import { BrandMark } from "./brand-mark";
const nav = [
  ["/admin", "Inicio", ChartNoAxesCombined, ["admin"]],
  ["/campo", "Campo", ClipboardList, ["captura", "admin"]],
  [
    "/admin/pacientes",
    "Expedientes",
    Users,
    ["captura", "consulta_clinica", "laboratorio", "admin"],
  ],
  ["/admin/conflictos", "Conflictos", GitCompareArrows, ["admin"]],
  ["/admin/bitacora", "Bitácora", ClipboardList, ["admin"]],
  [
    "/admin/jornadas",
    "Jornadas",
    CalendarDays,
    ["captura", "consulta_clinica", "laboratorio", "municipio", "admin"],
  ],
  [
    "/admin/pap",
    "Resultados PAP",
    FileHeart,
    ["consulta_clinica", "laboratorio", "admin"],
  ],
  ["/admin/impacto", "Impacto", ChartNoAxesCombined, ["admin"]],
] as const;
function Logout() {
  const { online } = useConnectivity();
  return (
    <button
      className="logout"
      disabled={!online}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/login";
      }}
    >
      <LogOut size={17} />
      Cerrar sesión
    </button>
  );
}
export function Shell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <Connectivity userId={user.id}>
      <div
        className={
          "app-shell " + (user.role === "captura" ? "field-shell" : "")
        }
      >
        <aside className="sidebar">
          <Link href="/campo" className="brand">
            <BrandMark />
            <div>
              NEXO ROSA<small>EIRA SYSTEM</small>
            </div>
          </Link>
          <div className="workspace-label">ESPACIO DE TRABAJO</div>
          <nav>
            {nav
              .filter((n) => (n[3] as readonly string[]).includes(user.role))
              .map(([url, label, Icon]) => (
                <Link
                  key={url}
                  href={url}
                  className={path === url ? "active" : ""}
                >
                  <Icon size={19} />
                  {label}
                  {path === url && <span className="nav-indicator" />}
                </Link>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <HeartHandshake size={27} />
            <p>
              Conectamos comunidades.
              <br />
              <strong>Cuidamos historias.</strong>
            </p>
            <span className="version">EIRA SYSTEM / FASE 04</span>
          </div>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <div>
              <span className="subtle">Mi espacio</span>
              <span className="breadcrumb">
                {" "}
                / {nav.find((n) => n[0] === path)?.[1] || "Inicio"}
              </span>
            </div>
            <div className="user-profile">
              <span className="avatar">
                {user.nombre.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{roleLabels[user.role]}</strong>
                <small>{user.email}</small>
              </div>
              <Logout />
            </div>
          </header>
          <main className="content">{children}</main>
          <footer className="app-footer">
            <span>Nexo Rosa EIRA · Cada historia cuenta.</span>
            <ChangeRequestLink />
            <span>
              Datos sintéticos · Entorno de demostración{" "}
              <ArrowUpRight size={13} />
            </span>
          </footer>
        </div>
      </div>
    </Connectivity>
  );
}
