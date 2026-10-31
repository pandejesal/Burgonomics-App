export interface ApprovedAward {
  readonly id: string;
  readonly title: string;
  /** Award body/edition, e.g. "Times Hospitality Icons 2025". */
  readonly issuer?: string;
  readonly description?: string;
  readonly year?: string;
  /** Landscape ceremony photograph. */
  readonly imageUrl?: string;
  /** Portrait certificate image. */
  readonly certificateUrl?: string;
  readonly imageAlt?: string;
  readonly certificateAlt?: string;
}

export interface ApprovedStoreAnnouncement {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly openingText?: string;
}

export interface ApprovedHomeContent {
  readonly awards: readonly ApprovedAward[];
  readonly upcomingStores: readonly ApprovedStoreAnnouncement[];
}

/**
 * Developer-maintained, owner-approved announcements only (D12).
 * Empty sections stay hidden. Announcements never create orderable stores.
 *
 * Awards: transcribed from the owner-supplied franchise deck (slides 6–7).
 * Upcoming stores: the `status: "upcoming"` rows of the owner's website data.
 * Dates are shown as planned, never promised, and "TBA" stays TBA.
 * Provenance and hashes: stages/08_menu/output/brand-provider-evidence-20261029.
 */
export const approvedHomeContent: ApprovedHomeContent = {
  awards: [
    {
      id: "times-hospitality-icons-2025",
      title: "Iconic Burger",
      issuer: "Times Hospitality Icons 2025",
      description: "The Times of India · powered by Campa · Gujarat",
      year: "2025",
      imageUrl: "/images/brand/times-iconic-burger-2025.webp",
      certificateUrl: "/images/brand/times-iconic-burger-certificate-2025.webp",
      imageAlt: "The Burgonomics team receiving the Times Hospitality Icons 2025 award",
      certificateAlt: "Times Hospitality Icons 2025 certificate naming Burgonomics Iconic Burger",
    },
    {
      id: "food-connoisseurs-qsr-2026",
      title: "Best Quick Service Restaurant Chain",
      issuer: "Food Connoisseurs India Awards 2026",
      description: "Ahmedabad · 11th Edition, West India",
      year: "2026",
      imageUrl: "/images/brand/food-connoisseurs-ceremony-2026.webp",
      certificateUrl: "/images/brand/food-connoisseurs-qsr-certificate-2026.webp",
      imageAlt: "Burgonomics team at the Food Connoisseurs India Awards 2026 ceremony",
      certificateAlt:
        "Food Connoisseurs certificate for Best Quick Service Restaurant Chain, Ahmedabad 2026",
    },
    {
      id: "food-connoisseurs-burger-2026",
      title: "Best Burger Joint",
      issuer: "Food Connoisseurs India Awards 2026",
      description: "Ahmedabad · conferred 17 June 2026, Mumbai",
      year: "2026",
      imageUrl: "/images/brand/food-connoisseurs-team-2026.webp",
      certificateUrl: "/images/brand/food-connoisseurs-burger-certificate-2026.webp",
      imageAlt: "Burgonomics team holding the Best Burger Joint certificate",
      certificateAlt: "Food Connoisseurs certificate for Best Burger Joint, Ahmedabad 2026",
    },
  ],
  upcomingStores: [
    {
      id: "gor-dhod-road",
      name: "Gor Dhod Road",
      location: "Surat, Gujarat",
      openingText: "Planned for October 2026",
    },
    {
      id: "vallabh-vidhyanagar",
      name: "Vallabh Vidhyanagar",
      location: "Vallabh Vidhyanagar, Anand, Gujarat",
      openingText: "Planned for October 2026",
    },
    {
      id: "hinjawadi-phase-2",
      name: "Hinjawadi Phase 2",
      location: "VJ Happiness Street, Hinjawadi Phase 2, Pune",
      openingText: "Planned for October 2026",
    },
    {
      id: "patan",
      name: "Patan",
      location: "Patan, Gujarat",
      openingText: "Planned for October 2026",
    },
    {
      id: "chandra-park",
      name: "Chandra Park",
      location: "150 Feet Ring Road, Rajkot, Gujarat",
      openingText: "Opening date to be announced",
    },
    {
      id: "ghatlodiya",
      name: "Ghatlodiya",
      location: "Maharana Pratap Road, Chanakyapuri, Ahmedabad",
      openingText: "Opening date to be announced",
    },
    {
      id: "mehsana",
      name: "Mehsana",
      location: "Radhanpur Road, Mehsana, Gujarat",
      openingText: "Opening date to be announced",
    },
    {
      id: "tin-batti",
      name: "Tin Batti",
      location: "Seaface Road, Daman",
      openingText: "Opening date to be announced",
    },
  ],
};
