/** Time-of-day greeting used by the Home header. */
export function greetingForHour(hour: number, name?: string | null): string {
  const who = name?.trim() ? `, ${name.split(" ")[0]}` : "";
  if (hour < 5) return `Late night${who}`;
  if (hour < 12) return `Good morning${who}`;
  if (hour < 17) return `Good afternoon${who}`;
  if (hour < 21) return `Good evening${who}`;
  return `Good night${who}`;
}
