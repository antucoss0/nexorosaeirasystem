import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db, jwtSecret } from "./db";
import type { User } from "./rbac";
const key = new TextEncoder().encode(jwtSecret);
export async function signSession(user: User) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key);
}
export async function currentUser(): Promise<User | null> {
  try {
    const token = cookies().get("eira_session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return (
      (db
        .prepare("SELECT id,email,nombre,role,municipio FROM users WHERE id=?")
        .get(payload.sub) as User) || null
    );
  } catch {
    return null;
  }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.host === (req.headers.get("host") || new URL(req.url).host)
    );
  } catch {
    return false;
  }
}
