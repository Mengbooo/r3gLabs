import test from 'node:test';
import assert from 'node:assert/strict';
import { repeatProjectIndices } from '../src/lib/stack.ts';

for (const count of [1, 2, 5, 12, 25]) {
  test(`${count} project(s): whole ordered cycles without an empty seam`, () => {
    const source = Array.from({ length: count }, (_, i) => i);
    const repeated = repeatProjectIndices(source);
    assert(repeated.length >= 24);
    assert(repeated.length >= count * 3);
    assert.equal(repeated.length % count, 0);
    for (let i = 0; i < repeated.length * 2; i++) {
      assert.equal(repeated[i % repeated.length], source[i % count]);
    }
    assert.deepEqual(source, Array.from({ length: count }, (_, i) => i));
  });
}

test('filtered projects keep original identities and order, including a single match', () => {
  assert(repeatProjectIndices([7]).every(index => index === 7));
  assert.deepEqual(repeatProjectIndices([2, 7]).slice(0, 6), [2, 7, 2, 7, 2, 7]);
});

test('empty catalogue does not allocate cards', () => {
  assert.deepEqual(repeatProjectIndices([]), []);
});
