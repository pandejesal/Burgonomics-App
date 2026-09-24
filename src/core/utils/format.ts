export const formatINR = (value: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    // Exact paise everywhere: the gateway charges paise, so bills, payment
    // sheets, and invoices must show paise (₹199.99, never ₹200).
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural;
