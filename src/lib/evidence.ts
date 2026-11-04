export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export function evidenceIsValid(file: { type: string; size: number }): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size > 0 && file.size <= EVIDENCE_MAX_BYTES;
}