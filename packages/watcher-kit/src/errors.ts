/** `Error` messages read well; anything thrown has to be stringified. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
