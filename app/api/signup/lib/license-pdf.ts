import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LICENSE_LOGO_PNG_BASE64 } from "./license-logo";

// License certificate attached to the welcome mail, laid out after the meinTest
// letterhead template (Assets/…Lizenzdokumentation_Vorlage.docx). Built with
// pdf-lib (pure JS) so it runs in Vercel's serverless runtime.

const BRAND = rgb(0.596, 0.757, 0.169); // #98c12b
const INK = rgb(0.173, 0.173, 0.173);
const MUTED = rgb(0.45, 0.45, 0.45);
const SUPPORT_EMAIL = "support@meinTest.software";

const DE_MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export interface LicensePdfInput {
  productName: string;
  licensee: string;
  company: string;
  licenseKey: string;
  /** ISO date or null for a perpetual license. */
  expiresAt: string | null;
}

export async function buildLicensePdf(
  input: LicensePdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.productName} — License Certificate`);
  pdf.setProducer("meinTest GmbH");

  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const margin = 56;
  const right = width - margin;
  const now = new Date();

  // ── Letterhead: logo (left) + address (right) ──────────────────────────
  const logo = await pdf.embedPng(Buffer.from(LICENSE_LOGO_PNG_BASE64, "base64"));
  const logoW = 165;
  const logoH = (logo.height / logo.width) * logoW;
  const top = height - 50;
  page.drawImage(logo, { x: margin, y: top - logoH, width: logoW, height: logoH });

  const address = [
    "meinTest GmbH",
    "Neuengasse 25",
    "3011 Bern",
    "SWITZERLAND",
    "info@meinTest.software",
    "www.meinTest.software",
  ];
  address.forEach((line, i) => {
    drawRight(page, line, right, top - 4 - i * 11, 8.5, regular, MUTED);
  });

  let y = top - 74;
  page.drawLine({
    start: { x: margin, y },
    end: { x: right, y },
    thickness: 0.75,
    color: rgb(0.85, 0.85, 0.85),
  });

  // ── Date + title ───────────────────────────────────────────────────────
  y -= 26;
  drawRight(
    page,
    `Bern, ${now.getDate()}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    right,
    y,
    10,
    regular,
    MUTED,
  );

  y -= 34;
  page.drawText("License Certificate", { x: margin, y, size: 22, font: bold, color: INK });
  y -= 12;
  page.drawRectangle({ x: margin, y, width: right - margin, height: 2, color: BRAND });

  // ── Detail rows ────────────────────────────────────────────────────────
  y -= 40;
  const rows: [string, string, PDFFont][] = [
    ["Product", input.productName, bold],
    ["Licensee", input.licensee || "—", bold],
    ["Company", input.company || "—", bold],
    ["Issued", isoDate(now.toISOString()), bold],
    ["Valid until", input.expiresAt ? isoDate(input.expiresAt) : "Perpetual", bold],
    ["License key", input.licenseKey, mono],
  ];
  for (const [label, value, valueFont] of rows) {
    page.drawText(`${label}:`, { x: margin, y, size: 10, font: regular, color: MUTED });
    page.drawText(value, {
      x: margin + 110,
      y,
      size: valueFont === mono ? 11 : 12,
      font: valueFont,
      color: INK,
    });
    y -= 26;
  }

  // ── Support ────────────────────────────────────────────────────────────
  y -= 30;
  page.drawText("If you have any questions, please contact our support team:", {
    x: margin,
    y,
    size: 9.5,
    font: regular,
    color: MUTED,
  });
  y -= 18;
  page.drawText(SUPPORT_EMAIL, { x: margin, y, size: 11, font: bold, color: BRAND });

  // ── Footer ─────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: margin, y: 58 },
    end: { x: right, y: 58 },
    thickness: 0.75,
    color: rgb(0.85, 0.85, 0.85),
  });
  page.drawText(`© meinTest GmbH | ${now.getFullYear()}`, {
    x: margin,
    y: 44,
    size: 8.5,
    font: regular,
    color: MUTED,
  });

  return pdf.save();
}

function drawRight(
  page: PDFPage,
  text: string,
  xRight: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y, size, font, color });
}

function isoDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}
