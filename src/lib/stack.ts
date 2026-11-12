/** Repeat whole catalogue cycles so the seam always preserves project order. */
export function repeatProjectIndices(projects: readonly number[]): number[] {
  if (!projects.length) return [];
  // Three complete cycles, with at least 24 cards to fill the prototype's loop.
  const cycles = Math.max(3, Math.ceil(24 / projects.length));
  return Array.from(
    { length: projects.length * cycles },
    (_, index) => projects[index % projects.length],
  );
}
