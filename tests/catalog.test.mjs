import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd(),temporary = await mkdtemp(path.join(os.tmpdir(), 'r3g-labs-catalog-'));
await mkdir(path.join(temporary, 'projects'));
process.chdir(temporary);
const { getProjects, getProjectFiles } = await import('../src/lib/project-catalog.ts');
process.chdir(cwd);
after(() => rm(temporary, { recursive: true, force: true }));

async function fixture(id, overrides = {}) {
  const directory = path.join(temporary, 'projects', id);await mkdir(path.join(directory, 'cover'), { recursive: true });
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Test</title><h1>WIP</h1>');
  await writeFile(path.join(directory, 'cover/wip.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(path.join(directory, 'project.json'), JSON.stringify({ title: 'WIP', category: 'Work in progress', year: 2026, description: 'WIP', cover: 'cover/wip.svg', order: 0, ...overrides }));
  return directory;
}

test('discover independent folders, derive entry/cover URLs and order deterministically', async () => {
  await fixture('wip');await fixture('another-project', { title: 'Another', order: -1 });
  const projects = await getProjects();assert.deepEqual(projects.map(p => p.id), ['another-project', 'wip']);
  assert.equal(projects[1].entry, '/projects/wip/index.html');assert.equal(projects[1].cover, '/projects/wip/cover/wip.svg');
  await rm(path.join(temporary, 'projects/another-project'), { recursive: true });
});

test('drafts and private files are not published, project data/assets are', async () => {
  await fixture('draft', { published: false });
  const wip = path.join(temporary, 'projects/wip');await writeFile(path.join(wip, '.env'), 'SECRET=example');
  await writeFile(path.join(wip, 'README.md'), 'Private authoring instructions');await writeFile(path.join(wip, 'demo.js'), 'console.log("WIP")');
  await writeFile(path.join(wip, 'data.json'), '{"ok":true}');
  await symlink(path.join(wip, 'index.html'), path.join(wip, 'linked.html'));
  const files = (await getProjectFiles()).map(f => f.path);
  assert(files.includes('wip/index.html'));assert(files.includes('wip/cover/wip.svg'));assert(files.includes('wip/demo.js'));assert(files.includes('wip/data.json'));
  assert(!files.some(f => f.includes('draft') || /(?:project\.json|\.env|README|linked\.html)/.test(f)));
});

test('optional cover is supported and invalid paths / missing index are rejected', async () => {
  const directory = await fixture('optional', { cover: null });
  assert.equal((await getProjects()).find(p => p.id === 'optional').cover, null);
  await rm(directory, { recursive: true });
  const invalid = await fixture('invalid', { cover: '../wip/cover/wip.svg' });
  await assert.rejects(getProjects, /cover must be an image inside cover/);await rm(invalid, { recursive: true });
  const missing = await fixture('missing');await rm(path.join(missing, 'index.html'));
  await assert.rejects(getProjects, /ENOENT|index\.html/);await rm(missing, { recursive: true });
});
