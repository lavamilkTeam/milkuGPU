import { xml } from "./xml.js";

function createLayout() {
  let slot = 0;
  return () => {
    const current = slot++;
    return {
      x: 500 + (current % 5) * 680,
      y: 350 + Math.floor(current / 5) * 520,
    };
  };
}

function slicedArithmetic({ width }) {
  const padded = Math.ceil(width / 4) * 4;
  const c = new xml.Circuit({
    name: `SliceArithmetic${width}`,
    title: `${width}-bit dedicated add/sub`,
    inputs: [
      ["A", width],
      ["B", width],
      ["SUB", 1],
    ],
    outputs: [
      ["RESULT", width],
      ["CARRY", 1],
    ],
    ioRight: 4000,
  });
  const at = createLayout();
  c.truncate({
    ...at(),
    input: "A",
    inputWidth: width,
    output: "A_PAD",
    outputWidth: padded,
  });
  c.truncate({
    ...at(),
    input: "B",
    inputWidth: width,
    output: "B_PAD",
    outputWidth: padded,
  });
  c.invert({ ...at(), width: padded, input: "B_PAD", output: "B_NOT" });
  c.mux({
    ...at(),
    width: padded,
    inputs: ["B_PAD", "B_NOT"],
    select: "SUB",
    output: "B_EFFECTIVE",
  });
  for (const [input, prefix] of [
    ["A_PAD", "A"],
    ["B_EFFECTIVE", "B"],
    ["RESULT_PAD", "S"],
  ]) {
    c.split({
      ...at(),
      width: padded,
      input,
      groups: Array.from({ length: padded / 4 }, (_, i) => [
        `${prefix}_${i}`,
        4,
      ]),
    });
  }
  for (let i = 0; i < padded / 4; i++)
    c.adder({
      ...at(),
      width: 4,
      a: `A_${i}`,
      b: `B_${i}`,
      carryIn: i ? `C_${i}` : "SUB",
      sum: `S_${i}`,
      carryOut: i === padded / 4 - 1 ? "CARRY" : `C_${i + 1}`,
    });
  c.truncate({
    ...at(),
    input: "RESULT_PAD",
    inputWidth: padded,
    output: "RESULT",
    outputWidth: width,
  });
  return c;
}

function conditionalNegate({ width, arithmetic }) {
  const c = new xml.Circuit({
    name: `ConditionalNegate${width}`,
    title: `${width}-bit sign conversion`,
    inputs: [
      ["VALUE", width],
      ["NEG", 1],
    ],
    outputs: [["RESULT", width]],
    ioRight: 1800,
  });
  c.constant({ x: 300, y: 200, width, net: "ZERO" });
  c.constant({ x: 300, y: 300, value: 1, net: "ONE" });
  c.sub({
    circuit: arithmetic,
    x: 650,
    y: 160,
    nets: {
      A: "ZERO",
      B: "VALUE",
      SUB: "ONE",
      RESULT: "NEGATED",
      CARRY: "UNUSED_CARRY",
    },
  });
  c.mux({
    x: 1350,
    y: 300,
    width,
    inputs: ["VALUE", "NEGATED"],
    select: "NEG",
    output: "RESULT",
  });
  return c;
}

function unitBase({ width, name, title, negate }) {
  const c = new xml.Circuit({
    name,
    title,
    inputs: [
      ["CLK", 1],
      ["RESET", 1],
      ["START", 1],
      ["ACK", 1],
      ["SIGNED", 1],
      ["A", width],
      ["B", width],
    ],
    outputs: [
      ["BUSY", 1],
      ["DONE", 1],
      ["LO", width],
      ["HI", width],
      ["ERROR", 2],
    ],
    ioRight: 4000,
  });
  const at = createLayout();
  c.constant({ ...at(), value: 1, net: "ONE" });
  c.constant({ ...at(), net: "ZERO_BIT" });
  c.constant({ ...at(), width, net: "ZERO_WORD" });
  for (const value of ["A", "B"]) {
    c.split({
      ...at(),
      width,
      input: value,
      groups: [
        [`${value}_LOW`, width - 1],
        [`${value}_SIGN`, 1],
      ],
    });
    c.gate({
      ...at(),
      a: "SIGNED",
      b: `${value}_SIGN`,
      output: `NEG_${value}`,
    });
    c.sub({
      circuit: negate,
      ...at(),
      nets: { VALUE: value, NEG: `NEG_${value}`, RESULT: `ABS_${value}` },
    });
  }
  c.gate({
    ...at(),
    kind: "XOR Gate",
    a: "NEG_A",
    b: "NEG_B",
    output: "NEG_RESULT",
  });
  c.invert({ ...at(), input: "BUSY", output: "NOT_BUSY" });
  c.invert({ ...at(), input: "DONE", output: "NOT_DONE" });
  c.gate({ ...at(), a: "NOT_BUSY", b: "NOT_DONE", output: "IDLE" });
  c.gate({ ...at(), a: "START", b: "IDLE", output: "ACCEPT" });
  c.gate({
    ...at(),
    kind: "OR Gate",
    a: "ACCEPT",
    b: "BUSY",
    output: "STEP_ENABLE",
  });
  c.register({
    ...at(),
    width: 1,
    input: "NEG_RESULT",
    output: "RESULT_NEGATIVE",
    enable: "ACCEPT",
  });
  c.register({
    ...at(),
    width: 1,
    input: "NEG_A",
    output: "REMAINDER_NEGATIVE",
    enable: "ACCEPT",
  });
  return { c, at };
}

function controller({ c, at, width, initialError }) {
  const bits = Math.log2(width);
  c.constant({ ...at(), width: bits, net: "COUNT_ZERO" });
  c.constant({ ...at(), width: bits, value: 1, net: "COUNT_ONE" });
  c.constant({ ...at(), width: bits, value: width - 1, net: "COUNT_LAST" });
  c.equal({
    ...at(),
    width: bits,
    a: "COUNT",
    b: "COUNT_LAST",
    output: "LAST",
  });
  c.adder({
    ...at(),
    width: bits,
    a: "COUNT",
    b: "COUNT_ONE",
    carryIn: "ZERO_BIT",
    sum: "COUNT_PLUS",
    carryOut: "COUNT_WRAP",
  });
  c.mux({
    ...at(),
    width: bits,
    inputs: ["COUNT_PLUS", "COUNT_ZERO"],
    select: "ACCEPT",
    output: "COUNT_NEXT",
  });
  c.register({
    ...at(),
    width: bits,
    input: "COUNT_NEXT",
    output: "COUNT",
    enable: "STEP_ENABLE",
  });
  c.invert({ ...at(), input: "LAST", output: "NOT_LAST" });
  c.invert({ ...at(), input: initialError, output: "NO_INITIAL_ERROR" });
  c.gate({ ...at(), a: "ACCEPT", b: "NO_INITIAL_ERROR", output: "BEGIN_RUN" });
  c.gate({ ...at(), a: "BUSY", b: "NOT_LAST", output: "CONTINUE_RUN" });
  c.gate({
    ...at(),
    kind: "OR Gate",
    a: "BEGIN_RUN",
    b: "CONTINUE_RUN",
    output: "BUSY_NEXT",
  });
  c.register({
    ...at(),
    width: 1,
    input: "BUSY_NEXT",
    output: "BUSY",
    enable: "ONE",
  });
  c.gate({ ...at(), a: "ACCEPT", b: initialError, output: "ERROR_FINISH" });
  c.gate({ ...at(), a: "BUSY", b: "LAST", output: "ITERATION_FINISH" });
  c.gate({
    ...at(),
    kind: "OR Gate",
    a: "ERROR_FINISH",
    b: "ITERATION_FINISH",
    output: "FINISH",
  });
  c.invert({ ...at(), input: "ACK", output: "NOT_ACK" });
  c.gate({ ...at(), a: "DONE", b: "NOT_ACK", output: "HOLD_DONE" });
  c.gate({
    ...at(),
    kind: "OR Gate",
    a: "FINISH",
    b: "HOLD_DONE",
    output: "DONE_NEXT",
  });
  c.register({
    ...at(),
    width: 1,
    input: "DONE_NEXT",
    output: "DONE",
    enable: "ONE",
  });
}

function multiply({ width, arithmetic, negate, productNegate }) {
  const { c, at } = unitBase({
    width,
    name: "MultiplyUnit",
    title: `${width}-bit shift/add multiplier`,
    negate,
  });
  c.constant({ ...at(), width: 2, net: "ERROR" });
  c.register({
    ...at(),
    width,
    input: "ABS_A",
    output: "MULTIPLICAND",
    enable: "ACCEPT",
  });
  c.split({
    ...at(),
    width,
    input: "Q",
    groups: [
      ["Q_BIT", 1],
      ["Q_UPPER", width - 1],
    ],
  });
  c.mux({
    ...at(),
    width,
    inputs: ["ZERO_WORD", "MULTIPLICAND"],
    select: "Q_BIT",
    output: "ADDEND",
  });
  c.sub({
    circuit: arithmetic,
    ...at(),
    nets: {
      A: "H",
      B: "ADDEND",
      SUB: "ZERO_BIT",
      RESULT: "SUM",
      CARRY: "SUM_CARRY",
    },
  });
  c.split({
    ...at(),
    width,
    input: "SUM",
    groups: [
      ["SUM_BIT", 1],
      ["SUM_UPPER", width - 1],
    ],
  });
  c.split({
    ...at(),
    width,
    input: "H_SHIFT",
    groups: [
      ["SUM_UPPER", width - 1],
      ["SUM_CARRY", 1],
    ],
  });
  c.split({
    ...at(),
    width,
    input: "Q_SHIFT",
    groups: [
      ["Q_UPPER", width - 1],
      ["SUM_BIT", 1],
    ],
  });
  c.mux({
    ...at(),
    width,
    inputs: ["H_SHIFT", "ZERO_WORD"],
    select: "ACCEPT",
    output: "H_NEXT",
  });
  c.mux({
    ...at(),
    width,
    inputs: ["Q_SHIFT", "ABS_B"],
    select: "ACCEPT",
    output: "Q_NEXT",
  });
  c.register({
    ...at(),
    width,
    input: "H_NEXT",
    output: "H",
    enable: "STEP_ENABLE",
  });
  c.register({
    ...at(),
    width,
    input: "Q_NEXT",
    output: "Q",
    enable: "STEP_ENABLE",
  });
  c.split({
    ...at(),
    width: width * 2,
    input: "PRODUCT_UNSIGNED",
    groups: [
      ["Q", width],
      ["H", width],
    ],
  });
  c.sub({
    circuit: productNegate,
    ...at(),
    nets: {
      VALUE: "PRODUCT_UNSIGNED",
      NEG: "RESULT_NEGATIVE",
      RESULT: "PRODUCT_SIGNED",
    },
  });
  c.split({
    ...at(),
    width: width * 2,
    input: "PRODUCT_SIGNED",
    groups: [
      ["LO", width],
      ["HI", width],
    ],
  });
  controller({ c, at, width, initialError: "ZERO_BIT" });
  return c;
}

function divide({ width, arithmetic, negate }) {
  const { c, at } = unitBase({
    width,
    name: "DivideUnit",
    title: `${width}-bit trial/subtract divider`,
    negate,
  });
  c.constant({ ...at(), width: width + 1, net: "ZERO_REMAINDER" });
  c.constant({
    ...at(),
    width,
    value: 1n << BigInt(width - 1),
    net: "SIGNED_MIN",
  });
  c.constant({
    ...at(),
    width,
    value: (1n << BigInt(width)) - 1n,
    net: "MINUS_ONE",
  });
  c.equal({ ...at(), width, a: "B", b: "ZERO_WORD", output: "DIV_ZERO" });
  c.equal({ ...at(), width, a: "A", b: "SIGNED_MIN", output: "A_IS_MIN" });
  c.equal({ ...at(), width, a: "B", b: "MINUS_ONE", output: "B_IS_MINUS_ONE" });
  c.gate({
    ...at(),
    a: "A_IS_MIN",
    b: "B_IS_MINUS_ONE",
    output: "OVERFLOW_PAIR",
  });
  c.gate({
    ...at(),
    a: "OVERFLOW_PAIR",
    b: "SIGNED",
    output: "SIGNED_OVERFLOW",
  });
  c.gate({
    ...at(),
    kind: "OR Gate",
    a: "DIV_ZERO",
    b: "SIGNED_OVERFLOW",
    output: "INITIAL_ERROR",
  });
  c.split({
    ...at(),
    width: 2,
    input: "ERROR_INPUT",
    groups: [
      ["DIV_ZERO", 1],
      ["SIGNED_OVERFLOW", 1],
    ],
  });
  c.register({
    ...at(),
    width: 2,
    input: "ERROR_INPUT",
    output: "ERROR",
    enable: "ACCEPT",
  });
  c.register({
    ...at(),
    width: 1,
    input: "INITIAL_ERROR",
    output: "HAS_ERROR",
    enable: "ACCEPT",
  });
  c.register({
    ...at(),
    width,
    input: "ABS_B",
    output: "DIVISOR",
    enable: "ACCEPT",
  });
  c.truncate({
    ...at(),
    input: "DIVISOR",
    inputWidth: width,
    output: "DIVISOR_EXT",
    outputWidth: width + 1,
  });
  c.split({
    ...at(),
    width,
    input: "Q",
    groups: [
      ["Q_LOWER", width - 1],
      ["Q_MSB", 1],
    ],
  });
  c.split({
    ...at(),
    width: width + 1,
    input: "R",
    groups: [
      ["R_LOWER", width],
      ["R_EXTRA", 1],
    ],
  });
  c.split({
    ...at(),
    width: width + 1,
    input: "R_SHIFT",
    groups: [
      ["Q_MSB", 1],
      ["R_LOWER", width],
    ],
  });
  c.sub({
    circuit: arithmetic,
    ...at(),
    nets: {
      A: "R_SHIFT",
      B: "DIVISOR_EXT",
      SUB: "ONE",
      RESULT: "TRIAL",
      CARRY: "ENOUGH",
    },
  });
  c.mux({
    ...at(),
    width: width + 1,
    inputs: ["R_SHIFT", "TRIAL"],
    select: "ENOUGH",
    output: "R_STEP",
  });
  c.split({
    ...at(),
    width,
    input: "Q_SHIFT",
    groups: [
      ["ENOUGH", 1],
      ["Q_LOWER", width - 1],
    ],
  });
  c.mux({
    ...at(),
    width: width + 1,
    inputs: ["R_STEP", "ZERO_REMAINDER"],
    select: "ACCEPT",
    output: "R_NEXT",
  });
  c.mux({
    ...at(),
    width,
    inputs: ["Q_SHIFT", "ABS_A"],
    select: "ACCEPT",
    output: "Q_NEXT",
  });
  c.register({
    ...at(),
    width: width + 1,
    input: "R_NEXT",
    output: "R",
    enable: "STEP_ENABLE",
  });
  c.register({
    ...at(),
    width,
    input: "Q_NEXT",
    output: "Q",
    enable: "STEP_ENABLE",
  });
  c.sub({
    circuit: negate,
    ...at(),
    nets: { VALUE: "Q", NEG: "RESULT_NEGATIVE", RESULT: "QUOTIENT_SIGNED" },
  });
  c.sub({
    circuit: negate,
    ...at(),
    nets: {
      VALUE: "R_LOWER",
      NEG: "REMAINDER_NEGATIVE",
      RESULT: "REMAINDER_SIGNED",
    },
  });
  c.mux({
    ...at(),
    width,
    inputs: ["QUOTIENT_SIGNED", "ZERO_WORD"],
    select: "HAS_ERROR",
    output: "LO",
  });
  c.mux({
    ...at(),
    width,
    inputs: ["REMAINDER_SIGNED", "ZERO_WORD"],
    select: "HAS_ERROR",
    output: "HI",
  });
  controller({ c, at, width, initialError: "INITIAL_ERROR" });
  return c;
}

function create({ width }) {
  const arithmetic = slicedArithmetic({ width });
  const remainderArithmetic = slicedArithmetic({ width: width + 1 });
  const productArithmetic = slicedArithmetic({ width: width * 2 });
  const negate = conditionalNegate({ width, arithmetic });
  const productNegate = conditionalNegate({
    width: width * 2,
    arithmetic: productArithmetic,
  });
  const multiplier = multiply({ width, arithmetic, negate, productNegate });
  const divider = divide({ width, arithmetic: remainderArithmetic, negate });
  return {
    multiplier,
    divider,
    circuits: [
      arithmetic,
      remainderArithmetic,
      productArithmetic,
      negate,
      productNegate,
      multiplier,
      divider,
    ],
  };
}

export const arithmeticUnits = { create };
