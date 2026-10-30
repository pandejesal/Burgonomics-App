import { approvedHomeContent, type ApprovedHomeContent } from "../approvedHomeContent";
import { UpcomingBranches } from "./UpcomingBranches";

/**
 * Owner-approved announcements at the bottom of Home.
 *
 * Visual language comes from the Burgonomics franchise deck: a deep forest
 * "field" with warm ceremony photography, a thin gold rule and the MonstroSolid
 * display face for headings. Entries use bold Montserrat subheads and regular
 * Montserrat content, 16px titles and 14px metadata, no gold body copy.
 */
export function HomeAnnouncements({
  content = approvedHomeContent,
}: {
  content?: ApprovedHomeContent;
}) {
  if (content.awards.length === 0 && content.upcomingStores.length === 0) return null;

  const ceremonyPhotos = content.awards.filter((award) => award.imageUrl);

  return (
    <div className="space-y-10 px-4 pb-6 pt-4">
      {content.awards.length > 0 && (
        <section
          id="awards"
          aria-labelledby="home-awards-heading"
          className="overflow-hidden rounded-[var(--radius-xlarge)] bg-brand-field px-4 py-4 shadow-brand sm:px-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="type-brand-heading text-sm text-primary-foreground/70">Burgonomics</p>
              <h2
                id="home-awards-heading"
                className="type-brand-heading mt-1 text-2xl leading-tight text-primary-foreground"
              >
                Awards &amp; Recognition
              </h2>
            </div>
            <span className="type-caption text-primary-foreground/70">2025 — 2026</span>
          </div>

          <div aria-hidden="true" className="mt-3 h-px w-16 bg-gold" />

          {ceremonyPhotos.length > 0 && (
            <div className="mt-3">
              {ceremonyPhotos.slice(0, 1).map((award) => (
                <img
                  key={award.id}
                  src={award.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ objectPosition: "50% 20%" }}
                  className="aspect-[3/1] w-full rounded-[var(--radius-medium)] object-cover ring-1 ring-primary-foreground/15"
                />
              ))}
            </div>
          )}

          <ul className="mt-2 divide-y divide-primary-foreground/10">
            {content.awards.map((award) => (
              <li key={award.id} className="flex items-start gap-3 py-2.5">
                {award.certificateUrl && (
                  <img
                    src={award.certificateUrl}
                    alt={award.certificateAlt ?? `${award.title} certificate`}
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-12 shrink-0 rounded-[var(--radius-small)] object-cover ring-1 ring-primary-foreground/20"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="type-subheading text-base leading-snug text-primary-foreground">
                      {award.title}
                    </h3>
                    {award.year && (
                      <span className="type-caption font-semibold text-gold">{award.year}</span>
                    )}
                  </div>
                  {award.issuer && (
                    <p className="mt-0.5 type-caption text-primary-foreground/85">{award.issuer}</p>
                  )}
                  {award.description && (
                    <p className="type-caption text-primary-foreground/70" style={{ lineHeight: 1.35 }}>{award.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.upcomingStores.length > 0 && (
        <UpcomingBranches
          key={content.upcomingStores.map((store) => store.id).join("|")}
          stores={content.upcomingStores}
        />
      )}
    </div>
  );
}
