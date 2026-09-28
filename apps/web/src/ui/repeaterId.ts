/** Stable client-only id for repeater rows (not sent to the API). */
export function newRepeaterId(): string {
  return crypto.randomUUID()
}
