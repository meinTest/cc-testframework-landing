import { NextResponse } from "next/server";
import {
  listActiveLicenses,
  markReminderSent,
  type KeygenLicenseFull,
} from "../../signup/lib/keygen";
import { sendReminderEmail } from "../../signup/lib/resend";

const LOG_PREFIX = "[cron][trial-reminders]";

const REMIND_WINDOW_MIN_DAYS = 1.5;
const REMIND_WINDOW_MAX_DAYS = 2.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (expected && auth !== expected) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const dryRun = process.env.DRY_RUN === "true";
  const salesEmail = process.env.RESEND_SUPPORT_TO ?? "sales@itsbusiness.ch";

  const summary = { checked: 0, eligible: 0, reminded: 0, failed: 0 };

  let licenses: KeygenLicenseFull[];
  try {
    licenses = await listActiveLicenses(dryRun);
  } catch (err) {
    console.error(`${LOG_PREFIX} list failed`, err);
    return NextResponse.json(
      { ok: false, message: "Failed to list licenses" },
      { status: 500 },
    );
  }

  summary.checked = licenses.length;
  const now = Date.now();

  for (const license of licenses) {
    if (license.metadata.reminderSentAt) continue;
    if (!license.expiry) continue;

    const expiryMs = new Date(license.expiry).getTime();
    const daysUntilExpiry = (expiryMs - now) / MS_PER_DAY;
    if (
      daysUntilExpiry < REMIND_WINDOW_MIN_DAYS ||
      daysUntilExpiry > REMIND_WINDOW_MAX_DAYS
    ) {
      continue;
    }

    const email = stringMeta(license.metadata, "email");
    const customerName = stringMeta(license.metadata, "customerName") || "there";
    if (!email) {
      console.warn(
        `${LOG_PREFIX} license ${license.id} missing metadata.email — skipped`,
      );
      continue;
    }

    summary.eligible += 1;

    try {
      await sendReminderEmail(
        {
          toEmail: email,
          customerName,
          licenseKey: license.key,
          expiresAt: license.expiry,
          salesEmail,
        },
        dryRun,
      );
      await markReminderSent(license, dryRun);
      summary.reminded += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(`${LOG_PREFIX} reminder failed for ${license.id}`, err);
    }
  }

  console.log(`${LOG_PREFIX} run summary`, { ...summary, dryRun });
  return NextResponse.json({ ok: true, summary, dryRun });
}

function stringMeta(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
