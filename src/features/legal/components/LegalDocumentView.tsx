import * as React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppCard } from "@/shared/components/common/AppCard";
import { Text } from "@/shared/components/common/Text";
import { LEGAL_EFFECTIVE_DATE, type LegalDocument } from "@/features/legal/content/legalContent";
import { renderLegalDocument } from "@/features/legal/renderLegal";
import { PLACEHOLDER_LABELS } from "@/features/legal/placeholders";

interface Props {
  document: LegalDocument;
  /** Route to return to from the top bar. */
  backTo?: string;
}

/**
 * One legal page, rendered from the shared content module so the in-app copy is
 * byte-for-byte the same text the public URL publishes.
 *
 * A still-missing statutory fact renders as a visible "[TO BE SUPPLIED: …]"
 * mark plus a banner above the document. That banner is deliberate: the page is
 * legally incomplete until the owner supplies the fact, and hiding it would let
 * a store reviewer (and a customer) believe a number exists when it does not.
 */
export function LegalDocumentView({ document, backTo = "/profile" }: Props) {
  const rendered = React.useMemo(
    () => renderLegalDocument(document, PLACEHOLDER_LABELS),
    [document],
  );
  const missing = rendered.placeholderIds;

  return (
    <AppShell title={document.title} backTo={backTo} showTabs showTopBar>
      <div className="mx-auto max-w-[680px] space-y-5 px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            {missing.length > 0 ? (
              <AlertTriangle className="h-6 w-6" aria-hidden />
            ) : (
              <ShieldCheck className="h-6 w-6" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <Text as="h1" variant="headlineMedium" className="font-bold">
              {document.title}
            </Text>
            <Text variant="caption" tone="secondary">
              Effective {LEGAL_EFFECTIVE_DATE}
            </Text>
          </div>
        </div>

        {missing.length > 0 && (
          <div
            data-testid="legal-placeholder-banner"
            role="status"
            className="rounded-2xl border border-warning/40 bg-warning/10 p-4"
          >
            <Text variant="bodySmall" className="font-semibold">
              This page is not publishable yet
            </Text>
            <Text variant="bodySmall" tone="secondary" className="mt-1 leading-relaxed">
              {missing.length === 1
                ? "One statutory fact is still missing and is marked below."
                : `${missing.length} statutory facts are still missing and are marked below.`}{" "}
              The values are listed for the owner in LEGAL-FACTS-NEEDED.md, and the release
              checklist is blocked until they are supplied.
            </Text>
          </div>
        )}

        <AppCard padded className="space-y-4">
          <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
            {rendered.summary}
          </Text>

          {rendered.sections.map((section) => (
            <section key={section.id} className="space-y-2 border-t border-divider pt-3">
              <Text variant="titleMedium" className="font-bold">
                {section.heading}
              </Text>
              {section.blocks.map((block, index) => {
                if (block.kind === "list") {
                  return (
                    <ul
                      key={index}
                      className="list-disc space-y-1 pl-5 text-sm text-text-secondary"
                    >
                      {block.items?.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  );
                }
                if (block.kind === "facts") {
                  return (
                    <dl key={index} className="space-y-1.5 text-sm">
                      {block.rows?.map((row) => (
                        <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                          <dt className="font-semibold text-text-primary sm:w-56 sm:flex-none">
                            {row.label}
                          </dt>
                          <dd className="text-text-secondary">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  );
                }
                return (
                  <Text
                    key={index}
                    variant="bodySmall"
                    className={
                      block.kind === "note"
                        ? "rounded-xl bg-bg-secondary p-3 leading-relaxed text-text-secondary"
                        : "leading-relaxed text-text-secondary"
                    }
                  >
                    {block.text}
                  </Text>
                );
              })}
            </section>
          ))}
        </AppCard>
      </div>
    </AppShell>
  );
}

export default LegalDocumentView;
