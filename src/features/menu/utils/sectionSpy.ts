/**
 * Scroll-spy arithmetic for the continuous menu page.
 *
 * Kept pure and DOM-free so the "which heading is current" rule can be tested
 * without a browser. The component feeds viewport-relative rect tops in DOM
 * order; nothing here reads layout.
 */

export interface SectionViewportPosition {
  id: string;
  /** `element.getBoundingClientRect().top`, px from the viewport top. */
  top: number;
}

/**
 * The active section is the last one whose heading has reached the sticky
 * chrome line. A section taller than the viewport therefore stays active while
 * the user reads through it, and the first section is active at scroll top.
 *
 * `tolerance` absorbs sub-pixel rounding so a heading parked exactly at the
 * chrome edge is not fought over by two sections.
 */
export function pickActiveSection(
  sections: ReadonlyArray<SectionViewportPosition>,
  stickyOffset: number,
  tolerance = 1,
): string | undefined {
  if (sections.length === 0) return undefined;
  let active: string | undefined;
  for (const section of sections) {
    if (section.top - stickyOffset <= tolerance) active = section.id;
  }
  return active ?? sections[0].id;
}

/**
 * `scroll-margin-top` for a section: the sticky chrome's measured bottom edge
 * plus a small breathing gap, so a jump never parks the heading under the rail
 * and keyboard focus stays visible.
 */
export function stickyScrollMargin(stickyOffset: number, gap = 8): number {
  const offset = Number.isFinite(stickyOffset) ? stickyOffset : 0;
  return Math.max(0, Math.round(offset)) + Math.max(0, Math.round(gap));
}
