import { query } from '../lib/dom';
import type { Project } from '../lib/project-types';

/** Isolated browsing context: project CSS and script cannot modify the Labs shell. */
export class ProjectFrame {
  private frame = query<HTMLIFrameElement>('#project-frame');
  private status = query('#frame-status');
  private message = query('#frame-status-message');
  private retry = query<HTMLButtonElement>('#frame-retry');
  private direct = query<HTMLAnchorElement>('#frame-direct');
  private project: Project | null = null;
  private request: AbortController | null = null;
  private token = '';
  private timeout = 0;

  constructor(private onClose: () => void) {
    this.retry.addEventListener('click', () => {
      if (this.project) void this.open(this.project);
    });
    window.addEventListener('message', (event) => {
      // Sandboxed project pages have an opaque origin; source + per-load nonce prevent spoofing.
      if (
        !this.project ||
        event.source !== this.frame.contentWindow ||
        !event.data ||
        typeof event.data !== 'object' ||
        event.data.embedId !== this.token
      )
        return;
      if (event.data.type === 'r3g:close') this.onClose();
      if (event.data.type === 'r3g:ready') this.loaded();
    });
  }

  async open(project: Project): Promise<void> {
    this.close();
    this.project = project;
    const controller = new AbortController();
    this.request = controller;
    this.token = crypto.randomUUID();
    const url = new URL(project.entry, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith('/projects/')
    )
      throw new Error('Project entries must be local /projects/ HTML pages.');
    this.frame.title = `${project.title} — project content`;
    this.direct.href = project.entry;
    this.status.hidden = false;
    this.message.textContent = 'Loading project…';
    this.retry.hidden = this.direct.hidden = true;
    this.frame.setAttribute('aria-busy', 'true');
    this.timeout = window.setTimeout(() => {
      if (this.request === controller) {
        controller.abort();
        this.failed();
      }
    }, 15000);
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Project request failed: ${response.status}`);
      if (this.request !== controller || controller.signal.aborted) return;
      url.searchParams.set('embed', this.token);
      this.frame.onload = () => {
        if (this.request === controller) this.loaded();
      };
      this.frame.onerror = () => {
        if (this.request === controller) this.failed();
      };
      this.frame.src = url.href;
    } catch (error) {
      if (this.request === controller && !controller.signal.aborted)
        this.failed();
    }
  }

  close(): void {
    this.request?.abort();
    this.request = null;
    window.clearTimeout(this.timeout);
    this.project = null;
    this.token = '';
    this.frame.onload = this.frame.onerror = null;
    this.frame.removeAttribute('src');
    this.status.hidden = true;
    this.frame.setAttribute('aria-busy', 'false');
  }

  private loaded(): void {
    window.clearTimeout(this.timeout);
    this.status.hidden = true;
    this.frame.setAttribute('aria-busy', 'false');
  }

  private failed(): void {
    window.clearTimeout(this.timeout);
    this.message.textContent = 'This project could not be loaded.';
    this.status.hidden = false;
    this.retry.hidden = this.direct.hidden = false;
    this.frame.setAttribute('aria-busy', 'false');
  }
}
