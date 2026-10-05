import { isa } from "@lavaneko/isa";

function generate({ width, divide }) {
  const mask = (1n << BigInt(width)) - 1n;
  const min = 1n << BigInt(width - 1);
  const pairs = [
    [0n, 0n],
    [0n, 3n],
    [1n, 1n],
    [7n, 3n],
    [mask - 6n, 3n],
    [7n, mask - 2n],
    [mask - 6n, mask - 2n],
    [min, mask],
    [min, 1n],
    [min, min],
    [mask, mask],
    [mask, 2n],
    [3n, 7n],
    [mask, min],
    [0x1234n, 0x71n],
  ];
  let seed = 271828n;
  for (let i = 0; i < 5; i++) {
    seed = (seed * 1664525n + 1013904223n) & mask;
    const a = seed;
    seed = (seed * 1664525n + 1013904223n) & mask;
    pairs.push([a, seed]);
  }
  const rows = [
    `CLK RESET START ACK SIGNED A[${width}] B[${width}] BUSY DONE LO[${width}] HI[${width}] ERROR[2] <set> <seq>`,
  ];
  let seq = 0;
  let error = 0;
  function row({
    clock,
    reset = 0,
    start = 0,
    ack = 0,
    signed = 0,
    a = 0n,
    b = 0n,
    busy = 0,
    done = 0,
    lo = "<DC>",
    hi = "<DC>",
  }) {
    return `${clock} ${reset} ${start} ${ack} ${signed} 0x${a.toString(16)} 0x${b.toString(16)} ${busy} ${done} ${lo} ${hi} 0x${error} 1 ${++seq}`;
  }
  rows.push(row({ clock: 0, reset: 1, lo: "0", hi: "0" }));
  for (const signed of [0, 1]) {
    for (const [a, b] of pairs) {
      const result = isa.multiplyDivide({
        width,
        a,
        b,
        signed: Boolean(signed),
        divide,
      });
      rows.push(row({ clock: 1, start: 1, signed, a, b }));
      error = result.mdError;
      rows.push(
        row({
          clock: 0,
          start: 1,
          signed,
          a,
          b,
          busy: error ? 0 : 1,
          done: error ? 1 : 0,
        }),
      );
      const output = {
        lo: `0x${result.lo.toString(16)}`,
        hi: `0x${result.hi.toString(16)}`,
      };
      if (!error) {
        for (let i = 0; i < width; i++) {
          rows.push(
            row({
              clock: 1,
              start: 1,
              signed: 1 - signed,
              a: mask ^ a,
              b: mask ^ b,
              busy: 1,
            }),
          );
          rows.push(
            row({
              clock: 0,
              start: 1,
              signed: 1 - signed,
              a: mask ^ a,
              b: mask ^ b,
              busy: i === width - 1 ? 0 : 1,
              done: i === width - 1 ? 1 : 0,
              ...(i === width - 1 ? output : {}),
            }),
          );
        }
      }
      rows.push(row({ clock: 1, start: 1, done: 1, ...output }));
      rows.push(row({ clock: 0, start: 1, done: 1, ...output }));
      rows.push(row({ clock: 1, ack: 1, done: 1, ...output }));
      rows.push(row({ clock: 0, ack: 1, ...output }));
    }
  }
  rows.push(row({ clock: 1, start: 1, a: 17n, b: 3n }));
  error = 0;
  rows.push(row({ clock: 0, start: 1, a: 17n, b: 3n, busy: 1 }));
  rows.push(row({ clock: 1, busy: 1 }));
  rows.push(row({ clock: 1, reset: 1, lo: "0", hi: "0" }));
  rows.push(row({ clock: 0, lo: "0", hi: "0" }));
  return `${rows.join("\n")}\n`;
}

export const unitVectors = { generate };
