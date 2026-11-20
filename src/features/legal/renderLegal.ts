/**
 * Legal renderer — pure functions that turn the legal content into display data.
 *
 * The same functions feed the in-app pages (React) and the static HTML
 * published for the store listings (Node). Keeping the transformation here
 * means the public page and the in-app page can never disagree, and it gives
 * one place to guarantee that a placeholder is always VISIBLY marked.
 */
import {
  PLACEHOLDER_TOKEN,
  placeholderMark,
  type LegalBlock,
  type LegalDocument,
} from "./content/legalContent";

/** A block of text with its placeholders already turned into marked values. */
export interface RenderedBlock {
  kind: LegalBlock["kind"];
  /** Body text for `paragraph` / `note`; empty for other kinds. */
  text?: string;
  items?: string[];
  rows?: Array<{ label: string; value: string }>;
}

export interface RenderedSection {
  id: string;
  heading: string;
  blocks: RenderedBlock[];
}

export interface RenderedDocument {
  slug: string;
  title: string;
  summary: string;
  sections: RenderedSection[];
  /** Every placeholder id this document still needs before it can publish. */
  placeholderIds: string[];
}

/**
 * Replace `[[PLACEHOLDER:<id>]]` tokens with a visibly marked value.
 *
 * The label shown comes from the caller's map (the documents pass
 * `PLACEHOLDER_LABELS`, derived from `LEGAL_PLACEHOLDERS`), so a reader — and a
 * store reviewer — sees exactly which fact is missing instead of a plausible
 * guess.
 */
export function resolvePlaceholders(text: string, labels: Record<string, string> = {}): string {
  return text.replace(PLACEHOLDER_TOKEN, (_token, id: string) => placeholderMark(labels[id] ?? id));
}

/** Ids of every placeholder token inside one string. */
export function placeholderIdsIn(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_TOKEN)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

function renderBlock(block: LegalBlock, labels: Record<string, string>): RenderedBlock {
  switch (block.kind) {
    case "paragraph":
    case "note":
      return { kind: block.kind, text: resolvePlaceholders(block.text, labels) };
    case "list":
      return { kind: "list", items: block.items.map((item) => resolvePlaceholders(item, labels)) };
    case "facts":
      return {
        kind: "facts",
        rows: block.rows.map((row) => ({
          label: row.label,
          value: resolvePlaceholders(row.value, labels),
        })),
      };
  }
}

/** Raw (unresolved) strings of one document, used to count its gaps. */
function rawStrings(document: LegalDocument): string[] {
  const out: string[] = [document.summary];
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (block.kind === "paragraph" || block.kind === "note") out.push(block.text);
      else if (block.kind === "list") out.push(...block.items);
      else block.rows.forEach((row) => out.push(row.value));
    }
  }
  return out;
}

/**
 * Render one document. `labels` maps placeholder ids to the human label the
 * marked value should carry (callers pass `PLACEHOLDER_LABELS`).
 */
export function renderLegalDocument(
  document: LegalDocument,
  labels: Record<string, string>,
): RenderedDocument {
  const sections = document.sections.map((section) => ({
    id: section.id,
    heading: section.heading,
    blocks: section.blocks.map((block) => renderBlock(block, labels)),
  }));

  // Collect from the RAW copy: resolution removes the tokens, so counting the
  // rendered text would always report zero gaps (and the "not publishable"
  // banner would silently disappear).
  const placeholderIds: string[] = [];
  for (const value of rawStrings(document)) {
    for (const id of placeholderIdsIn(value)) {
      if (!placeholderIds.includes(id)) placeholderIds.push(id);
    }
  }

  return {
    slug: document.slug,
    title: document.title,
    summary: resolvePlaceholders(document.summary, labels),
    sections,
    placeholderIds,
  };
}

/** True when a rendered document still shows a marked, unsupplied fact. */
export function isPublishable(rendered: RenderedDocument): boolean {
  return rendered.placeholderIds.length === 0;
}

/** Plain text of one rendered document — used by tests and the HTML page's meta. */
export function renderedText(rendered: RenderedDocument): string {
  const lines = [rendered.title, rendered.summary];
  for (const section of rendered.sections) {
    lines.push(section.heading);
    for (const block of section.blocks) {
      if (block.text) lines.push(block.text);
      block.items?.forEach((item) => lines.push(item));
      block.rows?.forEach((row) => lines.push(`${row.label}: ${row.value}`));
    }
  }
  return lines.join("\n");
}
