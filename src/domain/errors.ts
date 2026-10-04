/** Whether an error, or any error that caused it, says this (a trigger's RAISE, a constraint). */
export function causedBy(error: unknown, message: string): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(message)) return true;
  }
  return false;
}
