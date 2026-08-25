import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (request.cookies.get("user_banned") && pathname !== "/appeal") {
    return NextResponse.redirect(new URL("/appeal", request.url))
  }

  if (pathname.startsWith("/admin")) {
    if (!request.cookies.get("access_token")) {
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
