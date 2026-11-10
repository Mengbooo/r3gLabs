import { initializeNavigation } from './navigation';
import { query } from '../lib/dom';

document
  .querySelectorAll<HTMLElement>('.navigation')
  .forEach(initializeNavigation);

void import('./app')
  .then(({ initializeLabs }) => initializeLabs())
  .catch((error) => {
    console.error('Labs could not initialize.', error);
    document.body.classList.remove('loading');
    document.body.classList.add('fallback');
    document.querySelector('#loader')?.remove();
    query('#index').hidden = false;
    document
      .querySelectorAll<HTMLElement>('.navigation')
      .forEach((nav) => (nav.inert = false));
    query('#fallback-note').hidden = false;
    query('#fallback-note').textContent =
      'Unable to initialize the gallery. Open the project directly below.';
    // Independent project documents remain accessible even when the runtime bundle fails.
    document.querySelectorAll<HTMLButtonElement>('.index-row').forEach((row) =>
      row.addEventListener('click', () => {
        const data = JSON.parse(query('#project-data').textContent || '[]') as {
          id: string;
          entry: string;
        }[];
        const project = data.find((item) => item.id === row.dataset.project);
        if (project) window.location.assign(project.entry);
      }),
    );
  });
