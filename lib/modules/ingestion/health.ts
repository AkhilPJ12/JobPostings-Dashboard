const sourceFailures: string[] = []

export function resetSourceFailures(): void { sourceFailures.length = 0 }
export function noteSourceFailure(message: string): void {
  if (!sourceFailures.includes(message)) sourceFailures.push(message)
}
export function getSourceFailures(): string[] { return [...sourceFailures] }
