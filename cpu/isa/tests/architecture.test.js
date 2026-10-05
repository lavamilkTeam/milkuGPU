import assert from "node:assert/strict";
import { test } from "node:test";
import { isa } from "../index.js";

for (const width of [16, 32]) {
  test(`${width}-bit demo exercises arbitrary register write, memory and branches`, () => {
    const states = isa.trace({
      width,
      words: isa.demo({ width }).map(({ word }) => word),
    });
    const result = states.at(-1);
    assert.deepEqual(result.registers, [0n, 15n, 15n, 1n]);
    assert.equal(result.pc, 20);
    assert.equal(result.memory.get(0x20), 13n);
    assert.equal(result.memory.get(0x21), 15n);
    assert.equal(
      states.some(({ pc }) => pc === 8),
      false,
    );
    assert.equal(
      states.some(({ pc }) => pc === 16),
      true,
    );
  });
  test(`${width}-bit carry, borrow and non-destination preservation`, () => {
    const limit = (1n << BigInt(width)) - 1n;
    const initial = { ...isa.initialState(), registers: [limit, 1n, 9n, 7n] };
    const added = isa.execute({
      width,
      state: initial,
      word: isa.encode({
        width,
        operation: "add",
        destination: 2,
        sourceA: 0,
        sourceB: 1,
      }),
    });
    assert.deepEqual(added.registers, [limit, 1n, 0n, 7n]);
    assert.equal(added.carry, 1);
    assert.equal(added.zero, 1);
    const subtracted = isa.execute({
      width,
      state: added,
      word: isa.encode({
        width,
        operation: "sub",
        destination: 3,
        sourceA: 2,
        sourceB: 1,
      }),
    });
    assert.equal(subtracted.registers[3], limit);
    assert.equal(subtracted.carry, 0);
  });
}

for (const width of [16, 32]) {
  const mask = (1n << BigInt(width)) - 1n;
  const minimum = 1n << BigInt(width - 1);
  test(`${width}-bit multiply keeps the full product and signed high word`, () => {
    assert.deepEqual(isa.multiplyDivide({ width, a: mask, b: mask }), {
      lo: 1n,
      hi: mask - 1n,
      mdError: 0,
    });
    assert.deepEqual(
      isa.multiplyDivide({ width, a: -7n, b: 3n, signed: true }),
      { lo: mask - 20n, hi: mask, mdError: 0 },
    );
    assert.deepEqual(
      isa.multiplyDivide({ width, a: minimum, b: -1n, signed: true }),
      { lo: minimum, hi: 0n, mdError: 0 },
    );
  });
  test(`${width}-bit division truncates toward zero and keeps the dividend remainder sign`, () => {
    for (const [a, b, q, r] of [
      [-7n, 3n, -2n, -1n],
      [7n, -3n, -2n, 1n],
      [-7n, -3n, 2n, -1n],
      [2n, 7n, 0n, 2n],
    ]) {
      const result = isa.multiplyDivide({
        width,
        a,
        b,
        signed: true,
        divide: true,
      });
      assert.equal(BigInt.asIntN(width, result.lo), q);
      assert.equal(BigInt.asIntN(width, result.hi), r);
      assert.equal(a, q * b + r);
    }
  });
  test(`${width}-bit division errors preserve the destination and flags`, () => {
    for (const [a, b, mdError] of [
      [7n, 0n, 1],
      [minimum, mask, 2],
    ]) {
      const state = {
        ...isa.initialState(),
        registers: [a, b, 99n, 11n],
        zero: 1,
        carry: 1,
        hi: 55n,
        lo: 66n,
      };
      const result = isa.execute({
        width,
        state,
        word: isa.encode({
          width,
          operation: "div",
          destination: 2,
          sourceA: 0,
          sourceB: 1,
        }),
      });
      assert.deepEqual(result.registers, state.registers);
      assert.equal(result.pc, 1);
      assert.equal(result.zero, 1);
      assert.equal(result.carry, 1);
      assert.deepEqual(
        [result.lo, result.hi, result.mdError],
        [0n, 0n, mdError],
      );
    }
  });
  test(`${width}-bit extended ROM exercises result reads and recovers after both errors`, () => {
    const states = isa.trace({
      width,
      words: isa.extendedDemo({ width }).map(({ word }) => word),
    });
    const result = states.at(-1);
    assert.equal(result.pc, 47);
    assert.deepEqual(result.registers, [7n, mask - 2n, mask - 1n, 1n]);
    assert.deepEqual(
      [result.lo, result.hi, result.mdError],
      [mask - 1n, 1n, 0],
    );
    assert.equal(result.memory.get(0x30), mask - 20n);
    assert.equal(result.memory.get(0x31), mask);
    assert.equal(result.memory.get(0x32), mask - 1n);
    assert.equal(result.memory.get(0x33), mask);
    assert.equal(result.memory.get(0x34), 1n);
    assert.equal(result.memory.get(0x35), 2n);
    assert.equal(result.zero, 1);
    assert.equal(result.carry, 1);
  });
}
