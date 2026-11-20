/**
 * Placeholder label map — the human wording a marked "[TO BE SUPPLIED: …]"
 * value carries when a document is rendered.
 *
 * Derived from `LEGAL_PLACEHOLDERS` so the marking and the published list of
 * missing facts (LEGAL-FACTS-NEEDED.md) can never drift apart.
 */
import { LEGAL_PLACEHOLDERS } from "./content/legalContent";

export const PLACEHOLDER_LABELS: Record<string, string> = Object.fromEntries(
  LEGAL_PLACEHOLDERS.map((placeholder) => [placeholder.id, placeholder.label]),
);
