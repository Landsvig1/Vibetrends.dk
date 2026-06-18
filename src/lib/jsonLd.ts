/**
 * Serialize data for safe embedding inside a <script type="application/ld+json">
 * block. Escapes "<" so user-controlled strings cannot break out of the script
 * element (e.g. a title containing "</script>") and inject executable markup.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
