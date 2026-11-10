import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Project } from './project-types';

export const projectsDirectory = path.resolve(process.cwd(), 'projects');
const coverExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
]);

function text(value: unknown, field: string, folder: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(
      `${folder}/project.json: ${field} must be a non-empty string`,
    );
  return value.trim();
}

/** Read at build/dev request time, so adding a folder never requires editing application code. */
export async function getProjects(): Promise<Project[]> {
  const folders = await readdir(projectsDirectory, { withFileTypes: true });
  const projects: Project[] = [];
  for (const folder of folders) {
    if (!folder.isDirectory() || folder.name.startsWith('.')) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder.name))
      throw new Error(
        `Project folder must be a lowercase slug: ${folder.name}`,
      );
    const directory = path.join(projectsDirectory, folder.name);
    const metadata: unknown = JSON.parse(
      await readFile(path.join(directory, 'project.json'), 'utf8'),
    );
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
      throw new Error(`Invalid project metadata: ${folder.name}`);
    const data = metadata as Record<string, unknown>;
    if (data.published === false) continue;
    const title = text(data.title, 'title', folder.name);
    const category = text(data.category, 'category', folder.name);
    const description = text(data.description, 'description', folder.name);
    if (
      !Number.isInteger(data.year) ||
      Number(data.year) < 1900 ||
      Number(data.year) > 9999
    )
      throw new Error(`${folder.name}: year must be an integer`);
    if (
      data.order !== undefined &&
      (typeof data.order !== 'number' || !Number.isFinite(data.order))
    )
      throw new Error(`${folder.name}: order must be a finite number`);
    const entryFile = path.join(directory, 'index.html');
    if (!(await stat(entryFile)).isFile())
      throw new Error(`${folder.name}/index.html is required`);
    let cover: string | null = null;
    if (data.cover !== undefined && data.cover !== null) {
      const relative = text(data.cover, 'cover', folder.name);
      if (
        !relative.startsWith('cover/') ||
        relative.includes('..') ||
        relative.includes('\\') ||
        !coverExtensions.has(path.extname(relative).toLowerCase())
      )
        throw new Error(`${folder.name}: cover must be an image inside cover/`);
      if (!(await stat(path.join(directory, relative))).isFile())
        throw new Error(`${folder.name}: cover file is missing`);
      cover = `/projects/${folder.name}/${relative}`;
    }
    projects.push({
      id: folder.name,
      title,
      category,
      description,
      year: Number(data.year),
      cover,
      entry: `/projects/${folder.name}/index.html`,
      order: typeof data.order === 'number' ? data.order : 0,
    });
  }
  return projects.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const publicExtensions = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg',
  '.pdf',
  '.glb',
  '.gltf',
  '.bin',
  '.wasm',
]);

/** Emit only published, regular project assets; never expose metadata, dotfiles or symlinks. */
export async function getProjectFiles(): Promise<
  { path: string; file: string }[]
> {
  const files: { path: string; file: string }[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (
        item.name.startsWith('.') ||
        item.name === 'node_modules' ||
        item.name === 'project.json'
      )
        continue;
      const relative = `${prefix}/${item.name}`,
        file = path.join(directory, item.name);
      if (item.isDirectory()) await walk(file, relative);
      else if (
        item.isFile() &&
        publicExtensions.has(path.extname(item.name).toLowerCase())
      )
        files.push({ path: relative, file });
    }
  }
  for (const project of await getProjects())
    await walk(path.join(projectsDirectory, project.id), project.id);
  return files;
}
