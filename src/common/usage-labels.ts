/**
 * Single source of truth for mapping a usage `kind` to its Arabic label
 * shown in quota / usage messages. Covers text / image / image_verify /
 * search; `image_verify` shares the 'الصور' label because it is part of the
 * image pipeline (vision verification of a generated image).
 *
 * Unknown kinds fall back to the raw `kind` string so a new kind never
 * silently renders an empty label.
 */
const KIND_LABELS: Record<string, string> = {
  text: 'المسودّات',
  image: 'الصور',
  image_verify: 'الصور',
  search: 'عمليات البحث',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}
