/** Public catalogue data. Paths are resolved from each project's own folder. */
export interface Project {
  id: string;
  title: string;
  category: string;
  year: number;
  description: string;
  cover: string | null;
  entry: string;
  order: number;
}
