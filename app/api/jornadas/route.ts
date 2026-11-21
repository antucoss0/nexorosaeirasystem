import { NextResponse } from "next/server";
import { actor, failure } from "@/lib/phase3-api";
import {
  clauses,
  clausesHash,
  templateVersion,
  defaults,
  listJornadas,
  listNotifications,
  saveJornada,
  generateLetter,
  transitionRequirement,
  remind,
} from "@/lib/phase3";
import { audit } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await actor();
    const jornadas = listJornadas(user);
    audit(user, "jornadas", "consultar_tablero", user.id, {
      cantidad: jornadas.length,
    });
    return NextResponse.json(
      {
        jornadas,
        notifications: ["admin", "municipio"].includes(user.role)
          ? listNotifications(user)
          : [],
        template: { clauses, hash: clausesHash, version: templateVersion },
        defaults,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const user = await actor(req),
      body = await req.json();
    let result;
    switch (body.action) {
      case "save":
        result = saveJornada(user, body.data);
        break;
      case "letter":
        result = generateLetter(user, body.data);
        break;
      case "transition":
        result = transitionRequirement(
          user,
          body.id,
          body.key,
          body.state,
          body.note,
        );
        break;
      case "remind":
        result = remind(user, body.id, body.key);
        break;
      default:
        throw Error("Acción inválida");
    }
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
