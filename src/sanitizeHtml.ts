/**
 * Sanitize HTML from note nodes to prevent XSS via event handlers.
 * Keeps only safe formatting elements and strips all on* attributes.
 */

const ALLOWED_TAGS = new Set([
  "b", "i", "u", "em", "strong", "font", "ul", "ol", "li",
  "br", "div", "span", "p", "sub", "sup",
]);

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap: keep children, discard the element itself
    const frag = doc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const clean = sanitizeNode(child, doc);
      if (clean) frag.appendChild(clean);
    }
    return frag;
  }

  const clean = doc.createElement(tag);

  // Copy only safe attributes (no on* event handlers)
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) continue;
    // Block javascript: URLs in any attribute
    if (attr.value.replace(/\s/g, "").toLowerCase().startsWith("javascript:")) continue;
    clean.setAttribute(attr.name, attr.value);
  }

  for (const child of Array.from(el.childNodes)) {
    const cleanChild = sanitizeNode(child, doc);
    if (cleanChild) clean.appendChild(cleanChild);
  }

  return clean;
}

export function sanitizeNoteHtml(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;
  const frag = document.createDocumentFragment();

  for (const child of Array.from(body.childNodes)) {
    const clean = sanitizeNode(child, document);
    if (clean) frag.appendChild(clean);
  }

  const wrapper = document.createElement("div");
  wrapper.appendChild(frag);
  return wrapper.innerHTML;
}
