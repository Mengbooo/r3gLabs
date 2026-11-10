import { test, expect, type Page } from '@playwright/test';

async function load(page: Page) {
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveCount(0);
  await expect(page.locator('#gl')).toHaveAttribute('aria-busy', 'false');
  await page.waitForTimeout(2300);
}
async function showList(page: Page, touch = false) {
  const logo = page.locator('#navigation-bottom .monogram');
  if (touch) await logo.tap();
  else await logo.hover();
  await expect(logo).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(650);
  if (touch) await page.locator('#list-toggle').tap();
  else await page.locator('#list-toggle').hover();
  await expect(page.locator('#labs-list .index-row')).toBeVisible();
  await page.waitForTimeout(650);
}
async function openWip(page: Page) {
  await showList(page);
  await page.locator('#labs-list .index-row').click();
  await expect(page.locator('body')).toHaveClass(/opened/);
  await expect(page.locator('#project-frame')).toBeVisible();
  await expect(page.frameLocator('#project-frame').locator('h1')).toHaveText(
    'WIP',
  );
  await expect(page.locator('#frame-status')).toBeHidden();
}

test('production catalogue contains one WIP, local assets and compact navigation', async ({
  page,
  request,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:4322') &&
      !request.url().startsWith('data:')
    )
      external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await load(page);
  const data = await page.locator('#project-data').textContent();
  expect(JSON.parse(data || '[]')).toMatchObject([
    {
      id: 'wip',
      title: 'WIP',
      entry: '/projects/wip/index.html',
      cover: '/projects/wip/cover/wip.svg',
    },
  ]);
  expect(JSON.parse(data || '[]')).toHaveLength(1);
  await expect(page.locator('.index-row')).toHaveCount(1);
  await expect(page.locator('.chip')).toHaveCount(2);
  await expect(page.locator('body')).not.toHaveClass(/fallback/);
  const webgl = await page
    .locator('#gl')
    .evaluate((canvas) => !!(canvas as HTMLCanvasElement).getContext('webgl2'));
  expect(webgl).toBe(true);
  await page.locator('#navigation .monogram').hover();
  await page.waitForTimeout(650);
  await expect(page.locator('#nav-links a')).toHaveText(['Index', 'Blog']);
  await expect(page.locator('#nav-links a').first()).toHaveAttribute(
    'href',
    'https://r3actgo.com/',
  );
  expect(
    await page
      .locator('#navigation')
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThan(330);
  await page.mouse.move(600, 500);
  await page.waitForTimeout(650);
  await page.screenshot({ path: 'tests/artifacts/production-desktop.png' });
  expect((await request.get('/projects/wip/index.html')).status()).toBe(200);
  expect(
    (await request.get('/projects/wip/cover/wip.svg')).headers()[
      'content-type'
    ],
  ).toContain('image/svg+xml');
  expect((await request.get('/projects/wip/project.json')).status()).toBe(404);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('single WIP card is raycast-clickable; independent HTML is isolated and returns by arrow', async ({
  page,
}) => {
  await load(page);
  let found = false;
  for (let y = 400; y <= 900 && !found; y += 80)
    for (let x = 400; x <= 950 && !found; x += 80) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(35);
      found = await page
        .locator('body')
        .evaluate((el) => el.classList.contains('hov'));
    }
  expect(found).toBe(true);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.frameLocator('#project-frame').locator('h1')).toHaveText(
    'WIP',
  );
  await expect(page.locator('#project-frame')).toBeVisible();
  await expect(page.locator('#navigation')).toHaveClass(/is-detail/);
  await expect(page.locator('#navigation .monogram')).toBeDisabled();
  await expect(page.locator('#nav-links a:visible')).toHaveCount(0);
  await expect(page.locator('#project-back')).toBeVisible();
  const isolated = await page
    .frameLocator('#project-frame')
    .locator('body')
    .evaluate(() => {
      try {
        void window.parent.document.body;
        return false;
      } catch {
        return true;
      }
    });
  expect(isolated).toBe(true);
  await page.evaluate(() =>
    window.postMessage({ type: 'r3g:close', embedId: 'forged' }, '*'),
  );
  await expect(page.locator('body')).toHaveClass(/opened/);
  await page.screenshot({ path: 'tests/artifacts/production-wip-detail.png' });
  await page.locator('#project-back').click();
  await expect(page.locator('body')).not.toHaveClass(/opened/);
  await expect(page.locator('#project-frame')).not.toHaveAttribute('src');
  await expect(page.locator('#navigation .monogram')).toBeEnabled();
  await expect(page.locator('#project-back')).toBeHidden();
});

test('two-stage panels stay unified, capped and scroll with many items', async ({
  page,
}) => {
  await load(page);
  await showList(page);
  const ext = page.locator('.labs-extension'),
    nav = page.locator('#navigation-bottom');
  expect(await ext.evaluate((el) => el.getBoundingClientRect().height)).toBe(
    370,
  );
  const w = await nav.evaluate((el) => el.getBoundingClientRect().width);
  await page.locator('#labs-list .index-row').evaluate((source) => {
    for (let i = 0; i < 80; i++) {
      const clone = source.cloneNode(true);
      (clone as HTMLElement).dataset.stress = '1';
      source.parentElement!.append(clone);
    }
  });
  expect(await ext.evaluate((el) => el.getBoundingClientRect().height)).toBe(
    370,
  );
  expect(
    await page.locator('#labs-list').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    }),
  ).toBeGreaterThan(0);
  await page
    .locator('[data-stress]')
    .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  await page.locator('#categories-toggle').hover();
  await page.waitForTimeout(650);
  await expect(page.locator('#labs-categories .chip')).toHaveCount(2);
  expect(await ext.evaluate((el) => el.getBoundingClientRect().height)).toBe(
    278,
  );
  await page.locator('.chip[data-category="Work in progress"]').click();
  await expect(page.locator('#index-count')).toHaveText('1 project');
  await page.locator('#list-toggle').hover();
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('#navigation-bottom')!,
      ext = document.querySelector<HTMLElement>('.labs-extension')!;
    (
      window as Window & { foldSamples?: { h: number; w: number }[] }
    ).foldSamples = [];
    const observer = new ResizeObserver(() =>
      (
        window as Window & { foldSamples?: { h: number; w: number }[] }
      ).foldSamples!.push({
        h: ext.getBoundingClientRect().height,
        w: nav.getBoundingClientRect().width,
      }),
    );
    observer.observe(nav);
    observer.observe(ext);
    setTimeout(() => observer.disconnect(), 1600);
  });
  await page.mouse.move(600, 500);
  await page.waitForTimeout(1400);
  const samples = await page.evaluate(
    () =>
      (window as Window & { foldSamples?: { h: number; w: number }[] })
        .foldSamples!,
  );
  expect(
    samples.filter((s) => s.h > 0).every((s) => Math.abs(s.w - w) < 0.1),
  ).toBe(true);
  expect(samples.filter((s) => s.w < w - 0.5).every((s) => s.h === 0)).toBe(
    true,
  );
  await expect(nav).not.toHaveClass(/is-folding/);
});

test('Escape inside a sandboxed project returns through the optional bridge', async ({
  page,
}) => {
  await load(page);
  await openWip(page);
  await page.frameLocator('#project-frame').locator('body').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/opened/);
});

test('missing project shows retry state without breaking shell navigation', async ({
  page,
}) => {
  await page.route('**/projects/wip/index.html*', (route) => route.abort());
  await load(page);
  await showList(page);
  await page.locator('#labs-list .index-row').click();
  await expect(page.locator('#frame-retry')).toBeVisible();
  await expect(page.locator('#frame-status-message')).toContainText(
    'could not be loaded',
  );
  await page.unroute('**/projects/wip/index.html*');
  await page.locator('#frame-retry').click();
  await expect(page.frameLocator('#project-frame').locator('h1')).toHaveText(
    'WIP',
  );
  await page.locator('#project-back').click();
  await expect(page.locator('body')).not.toHaveClass(/opened/);
});

test('returning during camera entry cannot reopen stale details', async ({
  page,
}) => {
  await load(page);
  await showList(page);
  await page.locator('#labs-list .index-row').click();
  await page.locator('#project-back').click();
  await page.waitForTimeout(1700);
  await expect(page.locator('body')).not.toHaveClass(/opened/);
  await expect(page.locator('#page')).toBeHidden();
  await expect(page.locator('#project-frame')).not.toHaveAttribute('src');
});

test('WebGL unavailable falls back to the same independent project', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return /webgl/i.test(type)
        ? null
        : original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await load(page);
  await expect(page.locator('body')).toHaveClass(/fallback/);
  await expect(page.locator('.index-row')).toBeVisible();
  await page.locator('.index-row').click();
  await expect(page.frameLocator('#project-frame').locator('h1')).toHaveText(
    'WIP',
  );
  await page.locator('#project-back').click();
  await expect(page.locator('.index-row')).toBeVisible();
});

test('320px touch, short viewport and reduced motion preserve navigation and frame', async ({
  browser,
}) => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 520 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await load(page);
  await showList(page, true);
  expect(
    await page
      .locator('.labs-extension')
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(360);
  await page.locator('#labs-list .index-row').tap();
  await expect(page.frameLocator('#project-frame').locator('h1')).toHaveText(
    'WIP',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await page.screenshot({
    path: 'tests/artifacts/production-mobile-detail.png',
  });
  await page.locator('#project-back').tap();
  await expect(page.locator('body')).not.toHaveClass(/opened/);
  await page.close();
});

test('without JavaScript a direct WIP document remains available', async ({
  browser,
}) => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto('/');
  await page.getByRole('link', { name: 'WIP ↗' }).click();
  await expect(page.locator('h1')).toHaveText('WIP');
  await page.close();
});
