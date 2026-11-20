/**
 * Static HTML publisher for the legal pages.
 *
 * The store listings need a STABLE PUBLIC URL, not only an in-app screen. The
 * Customer app's own hosting is the only surface this package owns — the
 * marketing domain burgonomics.com is explicitly out of scope for this wave —
 * so this script writes five self-contained HTML documents under `public/`:
 *
 *   public/legal/index.html
 *   public/legal/privacy/index.html
 *   public/legal/terms/index.html
 *   public/legal/refund-policy/index.html
 *   public/legal/grievance/index.html
 *
 * Because they sit in `public/`, both Vite configs (`dist` and `dist/mobile`)
 * ship them, and both hosting targets serve them at
 *   <host>/legal/privacy   <host>/legal/terms   …
 * before the SPA catch-all rewrite (Firebase Hosting prefers a real static file
 * over `** → /index.html`).
 *
 * The text comes from `src/features/legal/content/legalContent.ts` — the same
 * module the in-app routes render — so the public page and the in-app page
 * cannot disagree. Run automatically by `prebuild` / `prebuild:mobile`; run it
 * by hand with `npx tsx scripts/render-legal-html.ts`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  LEGAL_DOCUMENTS,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_IDENTITY,
  legalPublicPath,
  type LegalDocument,
} from "../src/features/legal/content/legalContent";
import { PLACEHOLDER_LABELS } from "../src/features/legal/placeholders";
import { renderLegalDocument } from "../src/features/legal/renderLegal";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "public", "legal");

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** A marked, unsupplied fact is styled so nobody mistakes it for a value. */
const renderValue = (value: string): string =>
  escapeHtml(value).replace(
    /\[TO BE SUPPLIED: [^\]]*\]/g,
    (mark) => `<mark class="missing">${mark}</mark>`,
  );

const STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0 auto; max-width: 760px; padding: 32px 20px 72px;
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  color: #101010; background: #ffffff;
}
h1 { font-size: 28px; line-height: 1.25; margin: 0 0 6px; }
h2 { font-size: 18px; margin: 28px 0 10px; }
p, li { margin: 0 0 10px; }
ul { padding-left: 22px; }
dl { margin: 0; }
dt { font-weight: 600; margin-top: 10px; }
dd { margin: 2px 0 0; }
.meta { color: #555; font-size: 14px; margin-bottom: 24px; }
.note { background: #f4f6f4; border-radius: 10px; padding: 12px 14px; }
.warn {
  border: 1px solid #b26b00; background: #fff4e0; border-radius: 10px;
  padding: 14px 16px; margin-bottom: 22px;
}
.missing { background: #ffe680; padding: 0 4px; border-radius: 4px; font-weight: 600; }
nav ul { list-style: none; padding: 0; }
nav li { margin: 0 0 8px; }
a, nav a, footer a { color: #0e4825; }
footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #dcdcdc; font-size: 14px; color: #555; }
@media (prefers-color-scheme: dark) {
  body { color: #f2f2f2; background: #121212; }
  a, nav a, footer a { color: #7fd7a5; }
  .note { background: #1d1f1d; }
  .warn { background: #33270f; border-color: #8a6a1f; }
  .missing { background: #7a6400; color: #fff; }
  footer { border-color: #333; color: #a8a8a8; }
}
`;

const pageHeader = (title: string, missing: number): string => `
<header>
  <nav aria-label="Breadcrumb"><a href="/legal/">Burgonomics — Legal</a></nav>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(LEGAL_IDENTITY.entityRegistered)} (trading as ${escapeHtml(
    LEGAL_IDENTITY.tradeName,
  )}) · Effective ${escapeHtml(LEGAL_EFFECTIVE_DATE)}</p>
</header>
${
  missing > 0
    ? `<div class="warn" role="status"><strong>This page is not publishable yet.</strong> ${
        missing === 1
          ? "One statutory fact is still missing and is marked below."
          : `${missing} statutory facts are still missing and are marked below.`
      } The owner supplies them; the release checklist is blocked until they are in.</div>`
    : ""
}`;

const pageFooter = (): string => `
<footer>
<p>Seller: ${escapeHtml(LEGAL_IDENTITY.entityProse)}, trading as ${escapeHtml(
  LEGAL_IDENTITY.tradeName,
)}, ${escapeHtml(LEGAL_IDENTITY.address)}, India.</p>
<p>Support: ${escapeHtml(LEGAL_IDENTITY.supportEmail)} · Grievance: ${escapeHtml(
  LEGAL_IDENTITY.grievanceEmail,
)}</p>
</footer>
`;

function renderDocumentHtml(document: LegalDocument): string {
  const rendered = renderLegalDocument(document, PLACEHOLDER_LABELS);
  const sections = rendered.sections
    .map((section) => {
      const blocks = section.blocks
        .map((block) => {
          if (block.kind === "list") {
            return `<ul>${(block.items ?? [])
              .map((item) => `<li>${renderValue(item)}</li>`)
              .join("")}</ul>`;
          }
          if (block.kind === "facts") {
            return `<dl>${(block.rows ?? [])
              .map((row) => `<dt>${escapeHtml(row.label)}</dt><dd>${renderValue(row.value)}</dd>`)
              .join("")}</dl>`;
          }
          if (block.kind === "note") {
            return `<p class="note">${renderValue(block.text ?? "")}</p>`;
          }
          return `<p>${renderValue(block.text ?? "")}</p>`;
        })
        .join("\n");
      return `<section id="${escapeHtml(section.id)}"><h2>${escapeHtml(
        section.heading,
      )}</h2>\n${blocks}\n</section>`;
    })
    .join("\n");

  const nav = LEGAL_DOCUMENTS.filter((other) => other.slug !== document.slug)
    .map(
      (other) => `<li><a href="${legalPublicPath(other.slug)}">${escapeHtml(other.title)}</a></li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(document.title)} — Burgonomics</title>
<meta name="description" content="${escapeHtml(rendered.summary)}" />
<meta name="robots" content="index,follow" />
<style>${STYLES}</style>
</head>
<body>
${pageHeader(document.title, rendered.placeholderIds.length)}
<p>${renderValue(rendered.summary)}</p>
${sections}
${pageFooter()}
<nav><ul>${nav}</ul></nav>
</body>
</html>
`;
}

function renderIndexHtml(): string {
  const items = LEGAL_DOCUMENTS.map(
    (document) =>
      `<li><a href="${legalPublicPath(document.slug)}">${escapeHtml(
        document.title,
      )}</a> — ${escapeHtml(document.summary)}</li>`,
  ).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Legal — Burgonomics</title>
<meta name="description" content="Privacy Policy, Terms of Use, Refund &amp; Cancellation Policy and Grievance Redressal for the Burgonomics customer app." />
<style>${STYLES}</style>
</head>
<body>
${pageHeader("Legal documents", 0)}
<p>These pages are the customer-facing legal documents for the Burgonomics ordering app. They are
also available inside the app from Profile → More.</p>
<nav><ul>${items}</ul></nav>
${pageFooter()}
</body>
</html>
`;
}

export function generateLegalHtml(outDir: string = OUT): string[] {
  rmSync(outDir, { recursive: true, force: true });
  const written: string[] = [];

  mkdirSync(outDir, { recursive: true });
  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, renderIndexHtml());
  written.push(indexPath);

  for (const document of LEGAL_DOCUMENTS) {
    const dir = join(outDir, document.slug);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "index.html");
    writeFileSync(file, renderDocumentHtml(document));
    written.push(file);
  }

  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = generateLegalHtml();
  console.log(`legal pages: wrote ${files.length} files under ${OUT}`);
}
