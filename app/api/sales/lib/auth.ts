export interface AuthFailure {
  status: number;
  message: string;
}

export function checkSalesBearer(request: Request): AuthFailure | null {
  const expected = process.env.SALES_API_KEY;
  if (!expected) {
    return { status: 500, message: "Sales API not configured" };
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return { status: 401, message: "Unauthorized" };
  }
  return null;
}
