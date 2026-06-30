/**
 * Reply serializer that turns BigInt money (cents) into strings on the wire.
 * Registered via app.setReplySerializer so it applies to every route, including
 * schemaless ones (Invariant 1 across the API boundary).
 */
export const bigintReplySerializer = (payload: unknown): string =>
  JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
