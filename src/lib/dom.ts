export function query<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node;
}

export function projectCount(count: number): string {
  return `${count} ${count === 1 ? 'project' : 'projects'}`;
}
