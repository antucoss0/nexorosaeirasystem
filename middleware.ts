import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "./lib/request-origin";
export function middleware(req: NextRequest) {
  if (!req.cookies.get("eira_session")) {
    try {
      return NextResponse.redirect(new URL("/login", requestOrigin(req)));
    } catch {
      return new NextResponse("Origen no permitido", { status: 400 });
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ["/campo/:path*", "/admin/:path*"] };
