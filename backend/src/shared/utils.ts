/**
 * Utility helper functions for database serialization and compatibility.
 */

export function serializeJsonField(obj: any): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj === "string") return obj;
  return JSON.stringify(obj);
}

export function deserializeJsonField<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as T;
  } catch (e) {
    console.error("Failed to parse JSON field from DB:", e, str);
    return null;
  }
}
