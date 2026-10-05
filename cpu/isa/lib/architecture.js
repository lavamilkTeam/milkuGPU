function encode({
  width,
  operation,
  destination = 0,
  sourceA = 0,
  sourceB = 0,
  immediate = 0,
}) {
  if (![16, 32].includes(width))
    throw new RangeError("Data width must be 16 or 32");
  for (const register of [destination, sourceA, sourceB]) {
    if (!Number.isInteger(register) || register < 0 || register > 3)
      throw new RangeError("Register index must be 0..3");
  }
  const flags = {
    nop: 0,
    ldi: 0x22,
    addi: 0x4002,
    add: 0x4082,
    sub: 0x4083,
    cmp: 0x4081,
    load: 0x06,
    store: 0x08,
    jump: 0x10,
    jz: 0x8000,
    halt: 0x40,
    mulu: 0xc0,
    mul: 0xc1,
    divu: 0xc2,
    div: 0xc3,
    mflo: 0xc4,
    mfhi: 0xc5,
    mdstat: 0xc6,
  }[operation];
  if (flags === undefined)
    throw new RangeError(`Unknown operation: ${operation}`);
  const control =
    flags | (sourceB << 8) | (destination << 10) | (sourceA << 12);
  return (BigInt.asUintN(width, BigInt(immediate)) << 16n) | BigInt(control);
}

function demo({ width }) {
  const instructions = [
    { operation: "ldi", destination: 0, immediate: 10 },
    { operation: "ldi", destination: 1, immediate: 3 },
    { operation: "add", destination: 2, sourceA: 0, sourceB: 1 },
    { operation: "sub", destination: 3, sourceA: 2, sourceB: 1 },
    { operation: "store", sourceB: 2, immediate: 0x20 },
    { operation: "load", destination: 1, immediate: 0x20 },
    { operation: "cmp", sourceA: 1, sourceB: 2 },
    { operation: "jz", immediate: 10 },
    { operation: "ldi", destination: 0, immediate: 0xdead },
    { operation: "halt" },
    { operation: "ldi", destination: 0, immediate: 5 },
    { operation: "ldi", destination: 1, immediate: 0 },
    { operation: "ldi", destination: 3, immediate: 1 },
    { operation: "add", destination: 1, sourceA: 1, sourceB: 0 },
    { operation: "sub", destination: 0, sourceA: 0, sourceB: 3 },
    { operation: "jz", immediate: 18 },
    { operation: "jump", immediate: 13 },
    { operation: "halt" },
    { operation: "store", sourceB: 1, immediate: 0x21 },
    { operation: "load", destination: 2, immediate: 0x21 },
    { operation: "halt" },
  ];
  return instructions.map((instruction) => ({
    ...instruction,
    word: encode({ width, ...instruction }),
  }));
}

function initialState() {
  return {
    pc: 0,
    registers: [0n, 0n, 0n, 0n],
    carry: 0,
    zero: 0,
    memory: new Map(),
    halted: false,
    lo: 0n,
    hi: 0n,
    mdError: 0,
  };
}

function execute({ state, word, width }) {
  const control = Number(word & 0xffffn);
  const immediate = word >> 16n;
  const sourceB = (control >> 8) & 3;
  const destination = (control >> 10) & 3;
  const sourceA = (control >> 12) & 3;
  if ((control & 0xc0) === 0xc0) {
    const extension = control & 0xff;
    if (extension <= 0xc3) {
      const result = multiplyDivide({
        width,
        a: state.registers[sourceA],
        b: state.registers[sourceB],
        divide: Boolean(extension & 2),
        signed: Boolean(extension & 1),
      });
      return {
        ...state,
        ...result,
        pc: (state.pc + 1) & 0xffff,
        registers: state.registers.map((value, index) =>
          index === destination && !result.mdError ? result.lo : value,
        ),
      };
    }
    const value = { 196: state.lo, 197: state.hi, 198: BigInt(state.mdError) }[
      extension
    ];
    return {
      ...state,
      pc: (state.pc + 1) & 0xffff,
      registers: state.registers.map((current, index) =>
        index === destination && value !== undefined ? value : current,
      ),
    };
  }
  if (control & 0x40) return { ...state, halted: true };
  const a = control & 0x80 ? state.registers[sourceA] : immediate;
  const b = control & 0x20 ? 0n : state.registers[sourceB];
  const subtract = Boolean(control & 1);
  const raw = subtract ? a - b : a + b;
  const result = BigInt.asUintN(width, raw);
  const carry = subtract ? Number(a >= b) : Number(raw >= 1n << BigInt(width));
  const address = Number(immediate & 0xffffn);
  const writeData = control & 4 ? (state.memory.get(address) ?? 0n) : result;
  const registers = state.registers.map((value, index) =>
    control & 2 && index === destination ? writeData : value,
  );
  const memory =
    control & 8
      ? new Map([...state.memory, [address, state.registers[sourceB]]])
      : state.memory;
  const jump =
    Boolean(control & 0x10) || Boolean(control & 0x8000 && state.zero);
  return {
    ...state,
    pc: jump ? address : (state.pc + 1) & 0xffff,
    registers,
    carry: control & 0x4000 ? carry : state.carry,
    zero: control & 0x4000 ? Number(result === 0n) : state.zero,
    memory,
    halted: false,
  };
}

function multiplyDivide({ width, a, b, divide = false, signed = false }) {
  const left = signed ? BigInt.asIntN(width, a) : BigInt.asUintN(width, a);
  const right = signed ? BigInt.asIntN(width, b) : BigInt.asUintN(width, b);
  if (!divide) {
    const product = BigInt.asUintN(width * 2, left * right);
    return {
      lo: BigInt.asUintN(width, product),
      hi: product >> BigInt(width),
      mdError: 0,
    };
  }
  if (right === 0n) return { lo: 0n, hi: 0n, mdError: 1 };
  if (signed && left === -(1n << BigInt(width - 1)) && right === -1n)
    return { lo: 0n, hi: 0n, mdError: 2 };
  return {
    lo: BigInt.asUintN(width, left / right),
    hi: BigInt.asUintN(width, left % right),
    mdError: 0,
  };
}

function extendedDemo({ width }) {
  const extra = [
    { operation: "ldi", destination: 0, immediate: -7 },
    { operation: "ldi", destination: 1, immediate: 3 },
    { operation: "mul", destination: 2, sourceA: 0, sourceB: 1 },
    { operation: "mfhi", destination: 3 },
    { operation: "store", sourceB: 2, immediate: 0x30 },
    { operation: "store", sourceB: 3, immediate: 0x31 },
    { operation: "div", destination: 2, sourceA: 0, sourceB: 1 },
    { operation: "mfhi", destination: 3 },
    { operation: "store", sourceB: 2, immediate: 0x32 },
    { operation: "store", sourceB: 3, immediate: 0x33 },
    { operation: "ldi", destination: 0, immediate: -1 },
    { operation: "mulu", destination: 2, sourceA: 0, sourceB: 0 },
    { operation: "divu", destination: 2, sourceA: 0, sourceB: 1 },
    { operation: "mflo", destination: 2 },
    { operation: "ldi", destination: 1, immediate: 0 },
    { operation: "divu", destination: 2, sourceA: 0, sourceB: 1 },
    { operation: "mdstat", destination: 3 },
    { operation: "store", sourceB: 3, immediate: 0x34 },
    { operation: "ldi", destination: 0, immediate: 1n << BigInt(width - 1) },
    { operation: "ldi", destination: 1, immediate: -1 },
    { operation: "div", destination: 2, sourceA: 0, sourceB: 1 },
    { operation: "mdstat", destination: 3 },
    { operation: "store", sourceB: 3, immediate: 0x35 },
    { operation: "ldi", destination: 0, immediate: 7 },
    { operation: "ldi", destination: 1, immediate: -3 },
    { operation: "div", destination: 2, sourceA: 0, sourceB: 1 },
    { operation: "mfhi", destination: 3 },
    { operation: "halt" },
  ];
  return [
    ...demo({ width }).slice(0, -1),
    ...extra.map((instruction) => ({
      ...instruction,
      word: encode({ width, ...instruction }),
    })),
  ];
}

function trace({ words, width, limit = 1000 }) {
  let state = initialState();
  const states = [state];
  while (!state.halted && states.length <= limit) {
    state = execute({ state, word: words[state.pc] ?? 0x40n, width });
    states.push(state);
  }
  if (!state.halted)
    throw new Error("Program did not halt within the instruction budget");
  return states;
}

export const architecture = {
  encode,
  demo,
  extendedDemo,
  multiplyDivide,
  initialState,
  execute,
  trace,
};
