import { NextResponse } from "next/server";

interface SignupPayload {
  name?: string;
  email?: string;
  company?: string;
  githubUsername?: string;
}

export async function POST(request: Request) {
  let payload: SignupPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const missing = (
    ["name", "email", "company", "githubUsername"] as const
  ).filter((key) => !payload[key] || String(payload[key]).trim() === "");

  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, message: `Missing fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // Stub — replaced in Iter 19 with Keygen + GitHub + Resend orchestration.
  console.log("[signup-stub] received", {
    email: payload.email,
    githubUsername: payload.githubUsername,
    at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    message:
      "Trial request received. Backend orchestration not yet enabled — manual follow-up will occur.",
  });
}
