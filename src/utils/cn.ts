type ClassValue = string | false | null | undefined;

/**
 * Joins truthy class names. Kept dependency-free and intentionally small so it can be
 * used everywhere (including in render loops) without an extra runtime dependency.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
