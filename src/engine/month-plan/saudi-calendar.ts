export interface PlanSlot {
  date: Date;
  occasion?: string;
}

/**
 * Pure distributor — produces `count` month-plan slots starting from
 * `monthStart`. Occasion dates are placed first (deduped, capped at
 * `count`), the remainder spread evenly across days 1..28 of the month.
 *
 * Deterministic by design (NFR-2): no random jitter, easy to unit-test.
 * Phase 4 seeds the occasion list; here we accept it as input.
 */
export function distributePlan(
  count: number,
  monthStart: Date,
  occasions: { date: Date; name: string }[] = [],
): PlanSlot[] {
  const slots: PlanSlot[] = [];
  const usedDays = new Set<number>();

  // 1) Occasion slots first (within the month, deduped, capped at count).
  for (const occ of occasions) {
    if (slots.length >= count) break;
    const day = occ.date.getUTCDate();
    if (usedDays.has(day)) continue;
    usedDays.add(day);
    slots.push({ date: new Date(occ.date), occasion: occ.name });
  }

  // 2) Remaining slots spread evenly across days 1..28.
  const remaining = count - slots.length;
  if (remaining > 0) {
    const step = Math.max(1, Math.floor(28 / remaining));
    let day = 1;
    for (let i = 0; i < remaining; i += 1) {
      while (usedDays.has(day) && day <= 28) day += 1;
      const date = new Date(monthStart);
      date.setUTCDate(Math.min(day, 28));
      usedDays.add(day);
      slots.push({ date });
      day += step;
    }
  }

  return slots.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, count);
}
