import { query } from '../lib/dom';
type Point = [number, number];

export function initializeNavigation(nav: HTMLElement): void {
  const button = query<HTMLButtonElement>('.monogram', nav),
    group = query('.nav-group', nav),
    shell = query<SVGSVGElement>('.nav-shape', nav),
    path = query<SVGPathElement>('path', shell);
  const hover = matchMedia('(hover: hover) and (pointer: fine)'),
    extension = nav.querySelector<HTMLElement>('.labs-extension');
  let pointerInside = false,
    explicitOpen = false,
    detailMode = false;
  function update() {
    const open =
      !nav.inert &&
      (detailMode || explicitOpen || (hover.matches && pointerInside));
    // Freeze the current bar width while the upper section folds away.
    // This is tied to the actual height transition, not a guessed timeout.
    const folding =
      !open && extension && extension.getBoundingClientRect().height > 0.001;
    if (folding && !nav.classList.contains('is-folding'))
      nav.style.setProperty(
        '--labs-held-width',
        nav.getBoundingClientRect().width + 'px',
      );
    nav.classList.toggle('is-folding', !!folding);
    if (!folding) nav.style.removeProperty('--labs-held-width');
    nav.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute(
      'aria-label',
      detailMode
        ? 'Project navigation'
        : `${open ? 'Close' : 'Open'} ${nav.id === 'navigation-bottom' ? 'Labs navigation' : 'navigation'}`,
    );
    if (
      !open &&
      nav.contains(document.activeElement) &&
      document.activeElement !== button
    )
      button.focus({ preventScroll: true });
    if (!open && nav.classList.contains('has-panel'))
      nav.dispatchEvent(new Event('labs:close'));
    group.inert = !open;
  }
  function close() {
    pointerInside = explicitOpen = false;
    update();
  }
  function drawShell() {
    const rect = nav.getBoundingClientRect(),
      width = rect.width,
      styles = getComputedStyle(nav),
      number = (name: string) => parseFloat(styles.getPropertyValue(name));
    const inset = number('--edge'),
      join = number('--nav-join-radius'),
      control = join * (1 - 0.552284749831);
    const right = Math.max(
        0,
        Math.min(
          number('--nav-curve'),
          width - inset - number('--nav-logo-clearance'),
        ),
      ),
      p = (n: number) => Number(n.toFixed(3));
    const lift = extension?.getBoundingClientRect().height || 0,
      depth = 34 + lift;
    const radius = Math.min(
      number('--radius'),
      Math.max(0, width - right - inset - join),
    );
    let upper, shoulder;
    if (lift >= radius && radius > 0) {
      upper = `H${p(width - radius)} A${p(radius)} ${p(radius)} 0 0 0 ${p(width)} ${p(depth - radius)} V${p(join)}`;
      shoulder = `C${p(width)} ${p(control)} ${p(width + control)} 0 ${p(width + join)} 0`;
    } else if (lift > 0.001 && radius > 0) {
      // Split the idle cubic using de Casteljau, then morph both halves together.
      // Matching handle-length ratios keep their shared tangent continuous:
      // no little outward knot where the old corner met the bottom fillet.
      const k = 0.552284749831,
        split = radius / (radius + join),
        blend = lift / radius;
      const lerp = (a: Point, b: Point, t: number): Point => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ];
      const idle: Point[] = [
        [width - right, 34],
        [width - (right * 37) / 87, 34],
        [width - (right * 45.98) / 87, 0],
        [width, 0],
      ];
      const q = [
        lerp(idle[0], idle[1], split),
        lerp(idle[1], idle[2], split),
        lerp(idle[2], idle[3], split),
      ];
      const r = [lerp(q[0], q[1], split), lerp(q[1], q[2], split)],
        seam = lerp(r[0], r[1], split);
      const start = lerp(idle[0], [width - radius, 34 + radius], blend);
      const first = [
        lerp(q[0], [width - radius * (1 - k), 34 + radius], blend),
        lerp(r[0], [width, 34 + radius * k], blend),
        lerp(seam, [width, 34], blend),
      ];
      const second = [
        lerp(r[1], [width, control], blend),
        lerp(q[2], [width + control, 0], blend),
        lerp(idle[3], [width + join, 0], blend),
      ];
      const coordinates = (points: Point[]) =>
        points.map((point) => point.map(p).join(' ')).join(' ');
      upper = `H${p(start[0])} C${coordinates(first)}`;
      shoulder = `C${coordinates(second)}`;
    } else {
      upper = `H${p(width - right)}`;
      shoulder = `C${p(width - (right * 37) / 87)} 34 ${p(width - (right * 45.98) / 87)} 0 ${p(width)} 0`;
    }
    shell.style.height = depth + 'px';
    shell.setAttribute('viewBox', `0 0 ${p(width)} ${p(depth)}`);
    path.setAttribute(
      'd',
      `M0 0 V${p(depth + join)} H${p(inset)} C${p(inset)} ${p(depth + control)} ${p(inset + control)} ${p(depth)} ${p(inset + join)} ${p(depth)} ${upper} ${shoulder} Z`,
    );
  }
  const resize = new ResizeObserver(() => {
    drawShell();
    if (
      extension &&
      nav.classList.contains('is-folding') &&
      extension.getBoundingClientRect().height <= 0.001
    )
      update();
  });
  resize.observe(nav);
  if (extension) resize.observe(extension);
  drawShell();
  update();
  if (extension)
    for (const type of ['transitionend', 'transitioncancel'])
      extension.addEventListener(type, (event) => {
        if (
          event.target === extension &&
          (event as TransitionEvent).propertyName === 'height'
        ) {
          drawShell();
          update();
        }
      });
  {
    // Both menus size to their actual links, including font and viewport changes.
    function fitMenu() {
      const layout = getComputedStyle(query('nav', nav)),
        menu = getComputedStyle(group),
        items = [...group.querySelectorAll<HTMLElement>('a,button')].filter(
          (item) => !item.hidden,
        );
      const number = (value: string) => parseFloat(value) || 0;
      const content =
        items.reduce(
          (sum, item) => sum + item.getBoundingClientRect().width,
          0,
        ) +
        Math.max(0, items.length - 1) * number(menu.columnGap);
      const width =
        number(layout.paddingLeft) +
        number(layout.paddingRight) +
        button.getBoundingClientRect().width +
        number(layout.columnGap) +
        content;
      nav.style.setProperty('--nav-content-width', Math.ceil(width) + 'px');
    }
    fitMenu();
    document.fonts.ready.then(fitMenu);
    window.addEventListener('resize', fitMenu);
    if (nav.id === 'navigation')
      nav.addEventListener('labs:detail', (event) => {
        detailMode = event instanceof CustomEvent && event.detail === true;
        pointerInside = explicitOpen = false;
        nav.classList.toggle('is-detail', detailMode);
        button.disabled = detailMode;
        group
          .querySelectorAll<HTMLElement>('[data-site-link]')
          .forEach((link) => (link.hidden = detailMode));
        query('#project-back', group).hidden = !detailMode;
        query('nav', nav).setAttribute(
          'aria-label',
          detailMode ? 'Project navigation' : 'Main navigation',
        );
        fitMenu();
        update();
      });
    const contentObserver = new MutationObserver(fitMenu);
    contentObserver.observe(group, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }
  button.addEventListener('click', (event) => {
    if (detailMode || nav.inert || (hover.matches && event.detail !== 0))
      return;
    explicitOpen = !explicitOpen;
    update();
  });
  nav.addEventListener('pointerenter', () => {
    if (nav.inert) return;
    pointerInside = true;
    update();
  });
  nav.addEventListener('pointerleave', () => {
    pointerInside = false;
    update();
  });
  nav.addEventListener('focusout', (event) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !nav.contains(event.relatedTarget)
    ) {
      explicitOpen = false;
      update();
    }
  });
  hover.addEventListener('change', close);
  document.addEventListener('keydown', (event) => {
    if (
      detailMode ||
      event.key !== 'Escape' ||
      !nav.classList.contains('is-open')
    )
      return;
    close();
    event.stopPropagation();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node) || !nav.contains(event.target)) close();
  });
  group.addEventListener('click', (event) => {
    if (
      nav.id !== 'navigation-bottom' &&
      event.target instanceof Element &&
      event.target.closest('a,button')
    )
      close();
  });
}
