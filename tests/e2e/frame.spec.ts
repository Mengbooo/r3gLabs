import { test, expect } from '@playwright/test';

// Reference: r3gIndex viewport frame, not its 50px content-panel radius.
const desktop = { edge: 15, radius: 34, join: 34, curve: 90, closed: 145 };
const mobile = { edge: 8, radius: 23, join: 23, curve: 32, closed: 116 };

test('viewport frame, detail clipping and nav joins match r3g at every breakpoint', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveCount(0);
  for (const width of [1342, 1000, 760, 701, 700, 390, 320]) {
    const height = width < 701 ? 844 : 1000,
      reference = width <= 700 ? mobile : desktop;
    await page.setViewportSize({ width, height });
    await page.mouse.move(200, 200);
    await expect
      .poll(() =>
        page
          .locator('#navigation')
          .evaluate((el) => el.getBoundingClientRect().width),
      )
      .toBe(reference.closed);
    const frame = await page.locator('.window-edge').evaluate((el) => {
      const s = getComputedStyle(el),
        r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        radius: s.borderRadius,
        shadow: s.boxShadow,
        z: s.zIndex,
        events: s.pointerEvents,
      };
    });
    expect(frame).toEqual({
      x: reference.edge,
      y: reference.edge,
      width: width - reference.edge * 2,
      height: height - reference.edge * 2,
      radius: `${reference.radius}px`,
      shadow: 'rgb(6, 7, 9) 0px 0px 0px 50px',
      z: '90',
      events: 'none',
    });
    const detail = await page.locator('#page').evaluate((el) => {
      const s = getComputedStyle(el),
        r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        radius: s.borderRadius,
      };
    });
    expect(detail).toEqual({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      radius: frame.radius,
    });
    const nav = await page.locator('#navigation').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        join: parseFloat(s.getPropertyValue('--nav-join-radius')),
        curve: parseFloat(s.getPropertyValue('--nav-curve')),
        logo: parseFloat(s.getPropertyValue('--nav-logo-clearance')),
      };
    });
    expect(nav).toEqual({
      height: reference.edge + 34,
      join: reference.join,
      curve: reference.curve,
      logo: 76,
    });
    await expect
      .poll(() => page.locator('#navigation .nav-shape path').getAttribute('d'))
      .toContain(`M0 0 V${34 + reference.join} H${reference.edge} C`);
    if ([1342, 390].includes(width))
      await page.screenshot({
        path: `tests/artifacts/frame-aligned-${width}.png`,
      });
  }
});

test('mobile two-stage shell keeps the r3g joins and smoothly folds into its idle curve', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#loader')).toHaveCount(0);
  await page.locator('#navigation-bottom .monogram').hover();
  await page.waitForTimeout(650);
  await page.locator('#list-toggle').hover();
  await page.waitForTimeout(650);
  await expect(page.locator('#labs-list .index-row')).toBeVisible();
  await expect(page.locator('#navigation-bottom path')).toHaveAttribute(
    'd',
    /A23 23 0 0 0/,
  );
  await page.screenshot({
    path: 'tests/artifacts/frame-aligned-mobile-list.png',
  });
  const snapshots = await page.evaluate(async () => {
    const nav = document.querySelector<HTMLElement>('#navigation-bottom')!,
      ext = nav.querySelector<HTMLElement>('.labs-extension')!,
      path = nav.querySelector<SVGPathElement>('path')!;
    const result: { h: number; d: string; points: number[][] }[] = [];
    ext.style.setProperty('transition', 'none', 'important');
    // Mobile radius 23 + join 23 - toolbar depth 34 = 12px final morph band.
    for (const h of [12, 11.875, 8, 1, 0.125, 0]) {
      ext.style.setProperty('height', `${h}px`, 'important');
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const length = path.getTotalLength();
      result.push({
        h,
        d: path.getAttribute('d')!,
        points: Array.from({ length: 201 }, (_, i) => {
          const p = path.getPointAtLength((length * i) / 200);
          return [p.x, p.y];
        }),
      });
    }
    return result;
  });
  for (const sample of snapshots.filter(
    (sample) => sample.h > 0 && sample.h < 12,
  )) {
    const match = sample.d.match(/C([^C]+) C([^C]+) Z$/);
    expect(match).not.toBeNull();
    const [a, b] = match!
      .slice(1)
      .map((part) => part.trim().split(/\s+/).map(Number));
    expect(a).toHaveLength(6);
    expect(b).toHaveLength(6);
    const incoming = [a[4] - a[2], a[5] - a[3]],
      outgoing = [b[0] - a[4], b[1] - a[5]];
    const product = Math.hypot(...incoming) * Math.hypot(...outgoing);
    expect(
      incoming[0] * outgoing[0] + incoming[1] * outgoing[1],
    ).toBeGreaterThan(0);
    expect(
      Math.abs(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]) / product,
    ).toBeLessThan(0.002);
  }
  const last = snapshots.at(-2)!,
    idle = snapshots.at(-1)!;
  expect(
    Math.max(
      ...last.points.map(([x, y], i) =>
        Math.hypot(x - idle.points[i][0], y - idle.points[i][1]),
      ),
    ),
  ).toBeLessThan(1);
});
