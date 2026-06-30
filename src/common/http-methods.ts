// State-changing HTTP methods per RFC 7231 §4.2.1. GET/HEAD are safe; OPTIONS
// is a browser pre-flight, not a user-agent mutation. Single source of truth so
// the OriginGuard and CsrfGuard cannot drift apart.
export const MUTATION_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutation(method: string): boolean {
  return MUTATION_METHODS.has(method);
}
