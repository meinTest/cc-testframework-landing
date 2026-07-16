import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// License certificate attached to the welcome mail. Built with pdf-lib (pure JS,
// no native deps) so it works in Vercel's serverless runtime.

const BRAND = rgb(0.596, 0.757, 0.169); // #98c12b
const INK = rgb(0.173, 0.173, 0.173);
const MUTED = rgb(0.45, 0.45, 0.45);

export interface LicensePdfInput {
  productName: string;
  licensee: string;
  company: string;
  licenseKey: string;
  /** ISO date or null for a perpetual license. */
  expiresAt: string | null;
}

/** Render the license certificate and return the PDF bytes. */
export async function buildLicensePdf(
  input: LicensePdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.productName} — License`);
  pdf.setProducer("meinTest GmbH");

  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const left = 60;
  let y = height - 70;

  // Header
  page.drawText("meinTest GmbH", { x: left, y, size: 12, font: bold, color: BRAND });
  y -= 34;
  page.drawText("License Certificate", { x: left, y, size: 24, font: bold, color: INK });
  y -= 12;
  page.drawRectangle({ x: left, y, width: width - left * 2, height: 2, color: BRAND });
  y -= 44;

  // Detail rows
  const rows: [string, string][] = [
    ["Product", input.productName],
    ["Licensee", input.licensee || "—"],
    ["Company", input.company || "—"],
    ["Issued", formatDate(new Date().toISOString())],
    ["Valid until", input.expiresAt ? formatDate(input.expiresAt) : "Perpetual"],
  ];
  for (const [label, value] of rows) {
    page.drawText(label, { x: left, y, size: 10, font: regular, color: MUTED });
    page.drawText(value, { x: left + 130, y, size: 12, font: bold, color: INK });
    y -= 28;
  }

  // License key block
  y -= 10;
  page.drawText("License key", { x: left, y, size: 10, font: regular, color: MUTED });
  y -= 24;
  page.drawRectangle({
    x: left,
    y: y - 8,
    width: width - left * 2,
    height: 32,
    color: rgb(0.97, 0.97, 0.97),
  });
  page.drawText(input.licenseKey, { x: left + 12, y, size: 12, font: mono, color: INK });
  y -= 56;

  // Terms
  const notes = [
    "This license is issued per named user. It is not bound to a device — but it may",
    "only be used by one person at a time; please coordinate within your team.",
    "Keep this key confidential: it unlocks the product and its updates.",
  ];
  for (const line of notes) {
    page.drawText(line, { x: left, y, size: 10, font: regular, color: MUTED });
    y -= 15;
  }

  // Footer
  page.drawText("Questions? support@itsbusiness.ch", {
    x: left,
    y: 60,
    size: 10,
    font: regular,
    color: MUTED,
  });

  return pdf.save();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}
