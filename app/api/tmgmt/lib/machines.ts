import { validateKey, type KeygenValidation } from "./entitlement";

// Device/seat binding via Keygen machine activation (#29). One key = one device:
// each license carries maxMachines=1 and the trial policy uses
// machineUniquenessStrategy=UNIQUE_PER_PRODUCT, so a device that already ran a
// trial cannot activate a second trial of the same product (a new key won't bind
// → won't run). Those policy settings live in Keygen, not here; this module only
// activates/lists/frees machines and maps Keygen's verdicts to stable reasons.
//
// Machine operations use the server-side admin token; the client only ever sends
// its own license key (Bearer) + a device fingerprint.

const LOG_PREFIX = "[license][machines]";
const KEYGEN = "https://api.keygen.sh/v1/accounts";

// Unscoped validate-key codes that mean "the license itself is fine, it just has
// no active machine yet" (machine-scoped policies report these) → proceed to
// activate rather than treating the license as invalid.
const NEEDS_ACTIVATION_CODES = [
  "NO_MACHINE",
  "NO_MACHINES",
  "FINGERPRINT_SCOPE_MISMATCH",
  "FINGERPRINT_SCOPE_REQUIRED",
  "TOO_MANY_MACHINES",
];

export type ActivateReason =
  | "invalid"
  | "expired"
  | "suspended"
  | "seat-limit"
  | "device-already-registered"
  | "unavailable";

export type ActivateResult =
  | {
      ok: true;
      status: "already-active" | "activated";
      machineId: string;
      limit: number | null;
      used: number;
    }
  | {
      ok: false;
      status: number;
      reason: ActivateReason;
      message: string;
      limit?: number | null;
      used?: number;
    };

export interface DeviceInfo {
  id: string;
  fingerprint: string | null;
  name: string | null;
  createdAt: string | null;
}

export type MachinesResult =
  | { ok: true; devices: DeviceInfo[]; limit: number | null }
  | { ok: false; status: number; reason: ActivateReason; message: string };

export type DeactivateResult =
  | { ok: true }
  | { ok: false; status: number; reason: "invalid" | "not-found" | "forbidden" | "unavailable"; message: string };

// --- public API -------------------------------------------------------------

export async function activateDevice(
  licenseKey: string,
  fingerprint: string,
  dryRun: boolean,
): Promise<ActivateResult> {
  if (!licenseKey) return fail(401, "invalid", "Missing license key");
  if (!fingerprint) return fail(400, "invalid", "Missing device fingerprint");

  if (dryRun) {
    // Simulate the seat-limit / already-registered branches for smoke tests.
    if (fingerprint === "DRYRUN_SEATFULL") return fail(403, "seat-limit", "Seat limit reached", 1, 1);
    if (fingerprint === "DRYRUN_TAKEN") return fail(403, "device-already-registered", "Device already registered");
    return { ok: true, status: "activated", machineId: "dry-run-machine", limit: 1, used: 1 };
  }

  const body = await validateKey(licenseKey);
  if (!body) return fail(502, "unavailable", "License validation unavailable");

  const base = classifyBaseValidity(body);
  if (base) return base; // hard stop: expired / suspended / invalid

  const licenseId = body?.data?.id ?? "";
  if (!licenseId) return fail(401, "invalid", "Invalid license key");
  const limit = policyMaxMachines(body);

  // Already activated for this device? (idempotent — reinstall / restart)
  let machines: DeviceInfo[];
  try {
    machines = await listMachinesByLicense(licenseId);
  } catch (e) {
    console.error(`${LOG_PREFIX} list machines failed`, e);
    return fail(502, "unavailable", "Could not read device activations");
  }
  const existing = machines.find((m) => m.fingerprint === fingerprint);
  if (existing) {
    return { ok: true, status: "already-active", machineId: existing.id, limit, used: machines.length };
  }

  // New device → let Keygen enforce maxMachines + fingerprint uniqueness.
  const create = await createMachine(licenseId, fingerprint);
  if (create.status === 201 && create.machineId) {
    return { ok: true, status: "activated", machineId: create.machineId, limit, used: machines.length + 1 };
  }
  const reason = classifyCreateConflict(create.status, create.codes);
  if (reason === "seat-limit") {
    return fail(403, "seat-limit", "Seat limit reached for this license", limit, machines.length);
  }
  if (reason === "device-already-registered") {
    return fail(403, "device-already-registered", "This device is already registered to a license");
  }
  console.error(`${LOG_PREFIX} activation failed (HTTP ${create.status})`, create.codes);
  return fail(502, "unavailable", "Could not activate this device");
}

export async function listDevices(licenseKey: string, dryRun: boolean): Promise<MachinesResult> {
  if (!licenseKey) return { ok: false, status: 401, reason: "invalid", message: "Missing license key" };
  if (dryRun) {
    return {
      ok: true,
      limit: 1,
      devices: [
        { id: "dry-run-machine", fingerprint: "dryrun-fp", name: "Dry Run Device", createdAt: new Date().toISOString() },
      ],
    };
  }

  const body = await validateKey(licenseKey);
  if (!body) return { ok: false, status: 502, reason: "unavailable", message: "License validation unavailable" };
  const base = classifyBaseValidity(body);
  if (base) return { ok: false, status: base.status, reason: base.reason, message: base.message };

  const licenseId = body?.data?.id ?? "";
  if (!licenseId) return { ok: false, status: 401, reason: "invalid", message: "Invalid license key" };
  try {
    const devices = await listMachinesByLicense(licenseId);
    return { ok: true, devices, limit: policyMaxMachines(body) };
  } catch (e) {
    console.error(`${LOG_PREFIX} list machines failed`, e);
    return { ok: false, status: 502, reason: "unavailable", message: "Could not read device activations" };
  }
}

export async function deactivateDevice(
  licenseKey: string,
  machineId: string,
  dryRun: boolean,
): Promise<DeactivateResult> {
  if (!licenseKey) return { ok: false, status: 401, reason: "invalid", message: "Missing license key" };
  if (dryRun) return { ok: true };

  const body = await validateKey(licenseKey);
  if (!body) return { ok: false, status: 502, reason: "unavailable", message: "License validation unavailable" };
  const base = classifyBaseValidity(body);
  // For deactivation we don't care about expiry — a customer must be able to free
  // a seat from an expired license too. Only a hard-invalid key is rejected.
  if (base && base.reason === "invalid") {
    return { ok: false, status: 401, reason: "invalid", message: "Invalid license key" };
  }
  const licenseId = body?.data?.id ?? "";
  if (!licenseId) return { ok: false, status: 401, reason: "invalid", message: "Invalid license key" };

  // Ownership: the machine must belong to THIS license (never delete another
  // customer's device).
  const owner = await machineLicenseId(machineId);
  if (owner === null) return { ok: false, status: 404, reason: "not-found", message: "Device not found" };
  if (owner !== licenseId) return { ok: false, status: 403, reason: "forbidden", message: "Not your device" };

  const res = await fetch(`${KEYGEN}/${accountId()}/machines/${encodeURIComponent(machineId)}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    console.error(`${LOG_PREFIX} delete machine ${machineId} failed HTTP ${res.status}`);
    return { ok: false, status: 502, reason: "unavailable", message: "Could not free the device" };
  }
  return { ok: true };
}

// --- Keygen plumbing --------------------------------------------------------

async function listMachinesByLicense(licenseId: string): Promise<DeviceInfo[]> {
  const res = await fetch(
    `${KEYGEN}/${accountId()}/machines?limit=100&license=${encodeURIComponent(licenseId)}`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`Keygen list machines HTTP ${res.status}`);
  const body = await res.json();
  const data: unknown[] = Array.isArray(body?.data) ? body.data : [];
  const out: DeviceInfo[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) continue;
    const m = entry as { id?: string; attributes?: Record<string, unknown> };
    if (!m.id) continue;
    out.push({
      id: m.id,
      fingerprint: asStringOrNull(m.attributes?.fingerprint),
      name: asStringOrNull(m.attributes?.name),
      createdAt: asStringOrNull(m.attributes?.created),
    });
  }
  return out;
}

async function createMachine(
  licenseId: string,
  fingerprint: string,
): Promise<{ status: number; machineId?: string; codes: string[] }> {
  const res = await fetch(`${KEYGEN}/${accountId()}/machines`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      data: {
        type: "machines",
        attributes: { fingerprint },
        relationships: { license: { data: { type: "licenses", id: licenseId } } },
      },
    }),
  });
  if (res.status === 201) {
    const body = await res.json().catch(() => null);
    return { status: 201, machineId: body?.data?.id, codes: [] };
  }
  const body = await res.json().catch(() => null);
  const codes = extractErrorCodes(body);
  return { status: res.status, codes };
}

// The license id a machine belongs to (null when the machine doesn't exist).
async function machineLicenseId(machineId: string): Promise<string | null> {
  const res = await fetch(`${KEYGEN}/${accountId()}/machines/${encodeURIComponent(machineId)}`, {
    headers: adminHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Keygen get machine HTTP ${res.status}`);
  const body = await res.json();
  return body?.data?.relationships?.license?.data?.id ?? null;
}

// --- pure classifiers (unit-tested) -----------------------------------------

/** Hard-stop base validity from an unscoped validate-key. null → proceed to activate. */
export function classifyBaseValidity(
  body: KeygenValidation,
): { ok: false; status: number; reason: ActivateReason; message: string } | null {
  const valid = body?.meta?.valid === true;
  const code = body?.meta?.code ?? "";
  if (valid) return null;
  if (NEEDS_ACTIVATION_CODES.includes(code)) return null; // license fine, needs a machine
  if (code === "EXPIRED") return { ok: false, status: 403, reason: "expired", message: "License expired" };
  if (code === "SUSPENDED" || code === "BANNED") {
    return { ok: false, status: 403, reason: "suspended", message: "License suspended" };
  }
  return { ok: false, status: 401, reason: "invalid", message: "Invalid license key" };
}

/** Map a failed machine-create (status + Keygen error codes) to a stable reason. */
export function classifyCreateConflict(
  status: number,
  codes: string[],
): "seat-limit" | "device-already-registered" | "other" {
  const c = codes.map((x) => x.toUpperCase());
  if (c.some((x) => x.includes("MACHINE_LIMIT") || x.includes("TOO_MANY_MACHINES"))) {
    return "seat-limit";
  }
  if (c.some((x) => x.includes("FINGERPRINT") || x.includes("TAKEN") || x.includes("CONFLICT"))) {
    return "device-already-registered";
  }
  return "other";
}

function extractErrorCodes(body: unknown): string[] {
  const errors = (body as { errors?: unknown })?.errors;
  if (!Array.isArray(errors)) return [];
  const codes: string[] = [];
  for (const e of errors) {
    if (typeof e !== "object" || e === null) continue;
    const err = e as { code?: unknown; detail?: unknown; source?: { pointer?: unknown } };
    if (typeof err.code === "string") codes.push(err.code);
    if (typeof err.detail === "string") codes.push(err.detail);
    const pointer = err.source?.pointer;
    if (typeof pointer === "string") codes.push(pointer);
  }
  return codes;
}

function policyMaxMachines(body: KeygenValidation): number | null {
  const polId = body?.data?.relationships?.policy?.data?.id;
  if (!polId || !Array.isArray(body.included)) return null;
  const pol = body.included.find((x) => x?.type === "policies" && x.id === polId);
  const max = pol?.attributes?.maxMachines;
  return typeof max === "number" ? max : null;
}

function fail(
  status: number,
  reason: ActivateReason,
  message: string,
  limit?: number | null,
  used?: number,
): ActivateResult {
  return { ok: false, status, reason, message, limit, used };
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function accountId(): string {
  return required("KEYGEN_ACCOUNT_ID");
}

function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${required("KEYGEN_ADMIN_TOKEN")}`,
    "Content-Type": "application/vnd.api+json",
    Accept: "application/vnd.api+json",
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
