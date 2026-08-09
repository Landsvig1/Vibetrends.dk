/**
 * Helpers for asserting on the element tree a server component returns.
 *
 * The page tests used to reach into that tree positionally — `children[1]` for
 * the client island, `children[0]` for the JSON-LD script. That coupled every
 * one of them to the page's exact JSX shape, so wrapping the island in a layout
 * element to add a sibling broke twelve assertions that had nothing to do with
 * the change. These find elements by what they *are* instead of where they sit.
 *
 * Note the components under test are stubbed as anonymous `() => null`, so
 * matching by component identity or displayName isn't available — a
 * distinguishing prop name is the usable handle.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function children(node: any): any[] {
  const kids = node?.props?.children;
  if (kids === undefined || kids === null) return [];
  return Array.isArray(kids) ? kids : [kids];
}

/** Depth-first walk over every element in the tree, including the root. */
function* walk(node: any): Generator<any> {
  if (node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
    return;
  }
  yield node;
  for (const kid of children(node)) yield* walk(kid);
}

/**
 * First element in the tree carrying `propName`, or undefined.
 * Use the prop that identifies the component (`initialItems`, `scope`, …).
 */
export function findElementWithProp(tree: any, propName: string): any {
  for (const node of walk(tree)) {
    if (node?.props && propName in node.props) return node;
  }
  return undefined;
}

/** Same, but throws with a useful message instead of yielding undefined. */
export function getElementWithProp(tree: any, propName: string): any {
  const found = findElementWithProp(tree, propName);
  if (!found) {
    throw new Error(`No element in the returned tree has a "${propName}" prop.`);
  }
  return found;
}

/**
 * The parsed JSON-LD payload from the tree's `<script type="application/ld+json">`.
 * Throws if there isn't exactly one such script.
 */
export function getJsonLd(tree: any): any {
  const scripts = [...walk(tree)].filter(
    (n) => n?.type === "script" && n?.props?.type === "application/ld+json",
  );
  if (scripts.length !== 1) {
    throw new Error(`Expected exactly 1 JSON-LD script, found ${scripts.length}.`);
  }
  return JSON.parse(scripts[0].props.dangerouslySetInnerHTML.__html);
}
