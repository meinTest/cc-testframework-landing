import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/sales"],
};

const SALES_USER = "sales";

export function proxy(request: NextRequest) {
  const expected = process.env.SALES_API_KEY;
  if (!expected) {
    return new NextResponse("Sales UI not configured", { status: 500 });
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (match) {
    let decoded = "";
    try {
      decoded = atob(match[1]);
    } catch {
      decoded = "";
    }
    const colon = decoded.indexOf(":");
    if (colon >= 0) {
      const user = decoded.slice(0, colon);
      const pass = decoded.slice(colon + 1);
      if (user === SALES_USER && pass === expected) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="cc-testframework sales", charset="UTF-8"',
    },
  });
}
