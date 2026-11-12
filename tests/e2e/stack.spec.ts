import { test, expect, type Page } from '@playwright/test';

type RenderProbe = { draws: number[]; current: number };
async function instrumentRendering(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: RenderProbe = { draws: [], current: 0 };
    (window as Window & { renderProbe?: RenderProbe }).renderProbe = probe;
    for (const prototype of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      const draw = prototype.drawElements;
      prototype.drawElements = function (...args: Parameters<typeof draw>) {
        probe.current++;
        return draw.apply(this, args);
      };
    }
    function sample() {
      if (probe.current) {
        probe.draws.push(probe.current);
        if (probe.draws.length > 100) probe.draws.shift();
      }
      probe.current = 0;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}
async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveCount(0);
  await page.waitForTimeout(2400);
  await expect(page.locator('body')).not.toHaveClass(/fallback/);
}
async function checkRenderedStack(page: Page): Promise<void> {
  // Count actual WebGL draws: the old one-card/sparse state cannot satisfy this.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const samples = (window as Window & { renderProbe?: RenderProbe })
          .renderProbe!.draws;
        return Math.max(0, ...samples.slice(-10));
      }),
    )
    .toBeGreaterThan(8);
}
async function openList(page: Page): Promise<void> {
  await page.locator('#navigation-bottom .monogram').hover();
  await page.waitForTimeout(650);
  await page.locator('#list-toggle').hover();
  await expect(page.locator('#labs-list .index-row').first()).toBeVisible();
  await page.waitForTimeout(650);
}

test('one project fills an infinite stack; long scroll, dragging and return preserve its identity', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await instrumentRendering(page);
  await ready(page);
  await checkRenderedStack(page);
  await expect(page.locator('.index-row')).toHaveCount(1);
  await page.mouse.move(300, 500);
  const before = await page.locator('#gl').screenshot();
  await page.mouse.wheel(0, 1100);
  await page.waitForTimeout(750);
  expect(await page.locator('#gl').screenshot()).not.toEqual(before);
  for (const direction of [1, -1]) {
    await page.mouse.wheel(0, direction * 100000);
    await page.waitForTimeout(900);
    await checkRenderedStack(page);
  }
  await page.mouse.move(650, 600);
  await page.mouse.down();
  await page.mouse.move(800, 500, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/opened/);
  await page.waitForTimeout(900);
  await page.mouse.move(200, 500);
  await page.screenshot({ path: 'tests/artifacts/infinite-wip-stack.png' });
  await openList(page);
  await page.locator('#labs-list .index-row').click();
  await expect(page.frameLocator('#project-frame').locator('h1')).toHaveText(
    'WIP',
  );
  await page.locator('#project-back').click();
  await page.waitForTimeout(2300);
  await checkRenderedStack(page);
  await expect(page.locator('.index-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('two projects repeat visually without duplicating catalogue rows, including filtered loops', async ({
  page,
}) => {
  await instrumentRendering(page);
  // Supply a second published entry at the response boundary; leave the real WIP catalogue untouched.
  await page.route('http://127.0.0.1:4322/', async (route) => {
    const response = await route.fetch();
    let html = await response.text();
    html = html.replace(
      /(<script\b[^>]*id="project-data"[^>]*>)([\s\S]*?)(<\/script>)/,
      (_all, start: string, json: string, end: string) => {
        const projects = JSON.parse(json) as {
          id: string;
          title: string;
          entry: string;
          cover: string;
        }[];
        projects.push({
          ...projects[0],
          id: 'second',
          title: 'Second',
          entry: '/projects/second/index.html',
          cover: '/projects/second/cover/second.svg',
        });
        return start + JSON.stringify(projects) + end;
      },
    );
    html = html.replace(
      /(<button\b[^>]*class="index-row"[^>]*>[\s\S]*?<\/button>)/,
      (row) =>
        row +
        row
          .replace('data-project="wip"', 'data-project="second"')
          .replace('class="index-name">WIP', 'class="index-name">Second'),
    );
    await route.fulfill({ response, body: html });
  });
  await page.route('**/projects/second/cover/second.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#1e3fd8"/><text x="130" y="280" fill="white" font-size="56">Second</text></svg>',
    }),
  );
  await page.route('**/projects/second/index.html*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Second</title></head><body><h1>Second</h1></body></html>',
    }),
  );
  await ready(page);
  await checkRenderedStack(page);
  await page.mouse.move(200, 500);
  await page.screenshot({
    path: 'tests/artifacts/infinite-two-project-stack.png',
  });
  await openList(page);
  await expect(page.locator('#labs-list .index-row')).toHaveCount(2);
  await page.locator('#categories-toggle').hover();
  await page.waitForTimeout(650);
  await page.locator('.chip[data-category="Work in progress"]').click();
  await expect(page.locator('#index-count')).toHaveText('2 projects');
  await page.mouse.move(200, 500);
  await page.waitForTimeout(1500);
  await checkRenderedStack(page);
  await openList(page);
  await page.locator('#labs-list .index-row[data-project="second"]').click();
  await expect(page.frameLocator('#project-frame').locator('h1')).toHaveText(
    'Second',
  );
  await page.locator('#project-back').click();
  await page.waitForTimeout(2300);
  await checkRenderedStack(page);
});
