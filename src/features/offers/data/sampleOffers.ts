/**
 * Sample offers dataset (PETPOOJA-shaped).
 *
 * Served by `offersService` when demo/simulation mode is enabled so the
 * end-to-end checkout flow can exercise coupon validation, automatic
 * offers, and delivery-fee waivers without a live backend.
 */
import type { Offer } from "@/features/offers/models";

export const SAMPLE_OFFERS: Offer[] = [
  {
    id: "off_welcome50",
    type: "first_order",
    title: "Welcome offer — 50% off",
    description: "Flat 50% off (up to ₹150) on your first order.",
    code: "WELCOME50",
    automatic: false,
    discount: { mode: "percent", label: "50% OFF", value: 50, maxDiscount: 150 },
    eligibility: { minOrderValue: 199 },
    status: "active",
    priority: 1,
    termsAndConditions: [
      "Valid on first order only.",
      "Maximum discount ₹150.",
      "Cannot be combined with other offers.",
    ],
  },
  {
    id: "off_flat100",
    type: "coupon",
    title: "Flat ₹100 off",
    description: "Get ₹100 off on orders above ₹499.",
    code: "FLAT100",
    automatic: false,
    discount: { mode: "flat", label: "₹100 OFF", value: 100 },
    eligibility: { minOrderValue: 499 },
    status: "active",
    priority: 2,
  },
  {
    id: "off_veg10",
    type: "coupon",
    title: "Pure-Veg lovers — 10% off",
    description: "Extra 10% off (up to ₹80) on any order.",
    code: "VEG10",
    automatic: false,
    discount: { mode: "percent", label: "10% OFF", value: 10, maxDiscount: 80 },
    eligibility: { minOrderValue: 249 },
    status: "active",
    priority: 3,
  },
  {
    id: "off_free_delivery",
    type: "delivery",
    title: "Free Delivery",
    description: "Free delivery on orders above ₹399.",
    code: "FREEDEL",
    automatic: true,
    discount: { mode: "free_delivery", label: "Free Delivery" },
    eligibility: { minOrderValue: 399, applicableFulfillments: ["delivery"] },
    status: "active",
    priority: 4,
  },
];
