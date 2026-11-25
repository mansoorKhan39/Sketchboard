// "@name" in a comment. The server matches the handle to a board member (whole name without spaces, or a unique first name).
export function extractHandles(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:^|[^\p{L}\p{N}_])@([\p{L}\p{N}_]{1,40})/gu)) found.add(m[1].toLowerCase());
  return [...found].slice(0, 10);
}

// What to type after "@" for a person: their first name, or the whole name without spaces when two people share a first name.
export function handleFor(name: string, allNames: string[]): string {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N}_]/gu, "");
  const first = clean(name.trim().split(/\s+/)[0] ?? "");
  const same = allNames.filter((n) => clean(n.trim().split(/\s+/)[0] ?? "").toLowerCase() === first.toLowerCase()).length;
  return same > 1 ? clean(name) : first;
}
