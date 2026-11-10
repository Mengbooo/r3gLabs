import { query, projectCount } from '../lib/dom';
import type { Project } from '../lib/project-types';
import { GalleryScene } from './scene';
import { ProjectFrame } from './project-frame';
import { reducedMotion, tween, kill } from './motion';

export async function initializeLabs(): Promise<void> {
  const projects = JSON.parse(
    query('#project-data').textContent || '[]',
  ) as Project[];
  const body = document.body,
    canvas = query<HTMLCanvasElement>('#gl'),
    page = query('#page'),
    index = query('#index');
  const tools = query('#navigation-bottom'),
    extension = query('.labs-extension', tools),
    mainNav = query('#navigation');
  const chips = [...document.querySelectorAll<HTMLButtonElement>('.chip')],
    rows = [...document.querySelectorAll<HTMLButtonElement>('.index-row')];
  const chipsHome = document.createComment('Category control home'),
    indexHome = document.createComment('Project list home');
  query('#chips').before(chipsHome);
  index.before(indexHome);
  let activeTool: 'categories' | 'list' | null = null;
  let view: 'overview' | 'list' = 'overview',
    category = 'All';
  let ready = false,
    fallback = false,
    opened: Project | null = null,
    transitioning = false,
    version = 0;
  let previousFocus: HTMLElement | null = null,
    scene: GalleryScene | null = null;
  const frame = new ProjectFrame(closeProject);

  function setView(next: 'overview' | 'list', focus = false): void {
    view = next;
    index.hidden = activeTool === 'list' ? false : view !== 'list' && !fallback;
    if (focus) rows.find((row) => !row.hidden)?.focus();
  }

  function setTools(tool: typeof activeTool, focus = false): void {
    if (tool && (!ready || tools.inert)) return;
    activeTool = tool;
    if (!tool && extension.contains(document.activeElement))
      query<HTMLButtonElement>('.monogram', tools).focus({
        preventScroll: true,
      });
    if (tool === 'categories')
      query('#labs-categories').append(query('#chips'));
    else chipsHome.after(query('#chips'));
    if (tool === 'list') query('#labs-list').append(index);
    else indexHome.after(index);
    query('#legacy-controls').hidden = true;
    index.hidden = tool === 'list' ? false : view !== 'list' && !fallback;
    query('#labs-categories').hidden = tool !== 'categories';
    query('#labs-list').hidden = tool !== 'list';
    query('#categories-toggle').setAttribute(
      'aria-expanded',
      String(tool === 'categories'),
    );
    query('#list-toggle').setAttribute(
      'aria-expanded',
      String(tool === 'list'),
    );
    extension.inert = !tool;
    tools.classList.toggle('has-panel', !!tool);
    if (tool) {
      tools.dataset.tool = tool;
      query('#chips').inert = index.inert = false;
    } else delete tools.dataset.tool;
    if (focus) {
      if (tool === 'categories')
        chips
          .find((chip) => chip.getAttribute('aria-pressed') === 'true')
          ?.focus({ preventScroll: true });
      if (tool === 'list')
        rows.find((row) => !row.hidden)?.focus({ preventScroll: true });
    }
  }

  function selectCategory(next: string): void {
    if (!ready || opened) return;
    category = next;
    scene?.filter(category);
    rows.forEach((row) => {
      row.hidden =
        category !== 'All' &&
        projects.find((project) => project.id === row.dataset.project)
          ?.category !== category;
    });
    chips.forEach((chip) =>
      chip.setAttribute(
        'aria-pressed',
        String(chip.dataset.category === category),
      ),
    );
    const count = projects.filter(
      (project) => category === 'All' || project.category === category,
    ).length;
    query('#index-count').textContent = projectCount(count);
    query('#announce').textContent = `${category}: ${projectCount(count)}`;
  }

  function setChromeInert(value: boolean): void {
    document
      .querySelectorAll<HTMLElement>('.chrome:not(.navigation)')
      .forEach((node) => (node.inert = value));
    canvas.inert = value;
  }

  async function openProject(projectIndex: number): Promise<void> {
    const project = projects[projectIndex];
    if (!project || !ready || opened || transitioning) return;
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setTools(null);
    opened = project;
    transitioning = true;
    const current = ++version;
    body.classList.add('opened');
    body.classList.remove('hov');
    setChromeInert(true);
    mainNav.dispatchEvent(new CustomEvent('labs:detail', { detail: true }));
    void frame.open(project);
    const completed = scene ? await scene.open(projectIndex) : true;
    if (!completed || current !== version || !opened) return;
    page.inert = false;
    page.style.visibility = 'visible';
    tween(page, {
      opacity: 1,
      duration: 0.5,
      ease: 'power1.inOut',
      onComplete: () => {
        if (current !== version || !opened) return;
        transitioning = false;
        query<HTMLButtonElement>('#project-back').focus({
          preventScroll: true,
        });
      },
    });
  }

  function closeProject(): void {
    if (!opened) return;
    ++version;
    kill(page);
    frame.close();
    scene?.close();
    opened = null;
    transitioning = false;
    page.style.opacity = '0';
    page.style.visibility = 'hidden';
    page.inert = true;
    body.classList.remove('opened');
    setChromeInert(false);
    mainNav.dispatchEvent(new CustomEvent('labs:detail', { detail: false }));
    if (
      previousFocus &&
      document.contains(previousFocus) &&
      !previousFocus.closest('[hidden],[inert]')
    )
      previousFocus.focus({ preventScroll: true });
    else
      query<HTMLButtonElement>('.monogram', mainNav).focus({
        preventScroll: true,
      });
  }

  function useFallback(): void {
    if (fallback) return;
    if (opened) closeProject();
    scene?.destroy();
    scene = null;
    fallback = true;
    body.classList.add('fallback');
    query('#fallback-note').hidden = false;
    if (!projects.length)
      query('#fallback-note').textContent = 'No projects published yet.';
    setView('list');
  }

  chips.forEach((chip) =>
    chip.addEventListener('click', () =>
      selectCategory(chip.dataset.category || 'All'),
    ),
  );
  rows.forEach((row) => {
    const projectIndex = projects.findIndex(
      (project) => project.id === row.dataset.project,
    );
    row.addEventListener('pointerenter', () => scene?.focus(projectIndex));
    row.addEventListener('focus', () => scene?.focus(projectIndex));
    row.addEventListener('click', () => {
      void openProject(projectIndex);
    });
  });
  query('#skip').addEventListener('click', (event) => {
    event.preventDefault();
    setView('list', true);
  });
  for (const [id, tool] of [
    ['categories-toggle', 'categories'],
    ['list-toggle', 'list'],
  ] as const) {
    const trigger = query<HTMLButtonElement>('#' + id);
    trigger.addEventListener('pointerenter', () => {
      if (matchMedia('(hover: hover) and (pointer: fine)').matches && !opened)
        setTools(tool);
    });
    trigger.addEventListener('focus', () => {
      if (!opened) setTools(tool);
    });
    trigger.addEventListener('click', () => {
      if (!ready) return;
      if (opened) closeProject();
      setTools(tool, true);
    });
  }
  const logo = query<HTMLButtonElement>('.monogram', tools);
  logo.addEventListener('pointerenter', () => setTools(null));
  logo.addEventListener('focus', () => setTools(null));
  tools.addEventListener('labs:close', () => setTools(null));
  query('#project-back').addEventListener('click', closeProject);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeProject();
  });
  window.addEventListener('pagehide', () => frame.close(), { once: true });

  const progress = query('#progress');
  try {
    if (!projects.length) useFallback();
    else {
      scene = new GalleryScene(canvas, projects, {
        hover(projectIndex, x, y) {
          body.classList.toggle('hov', projectIndex !== null && !opened);
          const label = query('#label');
          label.textContent =
            projectIndex === null ? '' : projects[projectIndex].title;
          if (x !== undefined && y !== undefined)
            label.style.transform = `translate(${x + 14}px,${y + 12}px)`;
        },
        open: (projectIndex) => {
          void openProject(projectIndex);
        },
        unavailable: useFallback,
      });
      await scene.prepare((value) => {
        progress.textContent = `${Math.round(value)}%`;
        progress.setAttribute('aria-valuenow', String(Math.round(value)));
      });
    }
  } catch (error) {
    console.info(
      'r3g Labs: using the accessible project list.',
      error instanceof Error ? error.message : error,
    );
    useFallback();
  }
  if (fallback && projects.length) {
    // Covers are optional enhancements; the server-rendered buttons already work.
    await Promise.resolve();
  }
  progress.textContent = '100%';
  progress.setAttribute('aria-valuenow', '100');
  if (!reducedMotion)
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  tween(query('#loader-center'), { opacity: 0, duration: 0.5, delay: 0.25 });
  await new Promise<void>((resolve) =>
    tween(query('#loader'), {
      opacity: 0,
      duration: 0.5,
      delay: 0.75,
      ease: 'power1.inOut',
      onStart: () => scene?.start(),
      onComplete: () => {
        document.querySelector('#loader')?.remove();
        body.classList.remove('loading');
        ready = true;
        document
          .querySelectorAll<HTMLElement>('.navigation')
          .forEach((nav) => (nav.inert = false));
        canvas.setAttribute('aria-busy', 'false');
        index.setAttribute('aria-busy', 'false');
        query('#announce').textContent =
          `${projectCount(projects.length)} loaded. Open Labs to explore.`;
        resolve();
      },
    }),
  );
}
