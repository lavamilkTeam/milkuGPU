import { isa } from "@lavaneko/isa";
import { arithmeticUnits } from "./arithmetic-units.js";
import { modules } from "./modules.js";
import { unitVectors } from "./unit-vectors.js";
import { xml } from "./xml.js";

function sequencer() {
  const inputs = [
    "CLK",
    "RESET",
    "HALT",
    "REG_WRITE",
    "STORE",
    "FLAGS_WRITE",
    "JUMP",
    "JZ",
    "ALU_ZERO",
    "ALU_CARRY",
    "MD",
    "CORE_DONE",
    "MD_OK",
  ].map((name) => [name, 1]);
  const outputs = [
    "ENABLE",
    "FETCH",
    "WRITE",
    "MEM_WRITE",
    "BRANCH",
    "Z",
    "C",
    "BUSY",
    "MD_START",
    "MD_ACK",
  ].map((name) => [name, 1]);
  const c = new xml.Circuit({
    name: "Sequencer",
    title: "Wait / commit / branch / flags",
    inputs,
    outputs,
    ioRight: 2500,
  });
  const inverted = [
    ["HALT", "NOT_HALT"],
    ["RESET", "NOT_RESET"],
    ["BUSY", "NOT_BUSY"],
    ["MD", "NOT_MD"],
    ["CORE_DONE", "NOT_DONE"],
  ];
  inverted.forEach(([input, output], i) => {
    c.invert({ x: 450, y: 150 + i * 140, input, output });
  });
  const gates = [
    ["NOT_HALT", "NOT_RESET", "RUN", false],
    ["RUN", "NOT_BUSY", "FETCH", false],
    ["MD", "NOT_BUSY", "START_REQUEST", false],
    ["START_REQUEST", "RUN", "MD_START", false],
    ["MD", "BUSY", "MD_WAITING", false],
    ["MD_WAITING", "CORE_DONE", "MD_ACK", false],
    ["NOT_MD", "MD_ACK", "CAN_COMMIT", true],
    ["CAN_COMMIT", "RUN", "ENABLE", false],
    ["NOT_MD", "MD_OK", "ALLOW_WRITE", true],
    ["ENABLE", "REG_WRITE", "WRITE_REQUEST", false],
    ["WRITE_REQUEST", "ALLOW_WRITE", "WRITE", false],
    ["ENABLE", "STORE", "MEM_WRITE", false],
    ["ENABLE", "FLAGS_WRITE", "FLAG_ENABLE", false],
    ["JZ", "Z", "TAKEN_Z", false],
    ["JUMP", "TAKEN_Z", "BRANCH", true],
    ["MD", "NOT_DONE", "WAIT_NEXT", false],
  ];
  gates.forEach(([a, b, output, or], i) => {
    c.gate({
      x: 950 + Math.floor(i / 8) * 600,
      y: 150 + (i % 8) * 140,
      kind: or ? "OR Gate" : "AND Gate",
      a,
      b,
      output,
    });
  });
  c.constant({ x: 450, y: 950, value: 1, net: "ONE" });
  c.register({
    x: 2150,
    y: 250,
    width: 1,
    input: "WAIT_NEXT",
    output: "BUSY",
    enable: "ONE",
  });
  c.register({
    x: 2150,
    y: 550,
    width: 1,
    input: "ALU_ZERO",
    output: "Z",
    enable: "FLAG_ENABLE",
  });
  c.register({
    x: 2150,
    y: 850,
    width: 1,
    input: "ALU_CARRY",
    output: "C",
    enable: "FLAG_ENABLE",
  });
  return c;
}

function multiplyDividePath({ c, width, units }) {
  c.invert({ x: 2700, y: 1220, input: "MD_DIV", output: "IS_MULTIPLY" });
  c.gate({
    x: 2700,
    y: 1380,
    a: "MD_START",
    b: "IS_MULTIPLY",
    output: "MUL_START",
  });
  c.gate({ x: 2700, y: 1540, a: "MD_START", b: "MD_DIV", output: "DIV_START" });
  c.attach({
    x: 2570,
    y: 370,
    net: "READ_A",
    width,
    side: "down",
    length: 340,
  });
  for (const [prefix, circuit, y] of [
    ["MUL", units.multiplier, 1200],
    ["DIV", units.divider, 1800],
  ]) {
    c.sub({
      circuit,
      x: 3100,
      y,
      nets: {
        START: `${prefix}_START`,
        ACK: "MD_ACK",
        SIGNED: "MD_SIGNED",
        A: "READ_A",
        B: "READ_B",
        BUSY: `${prefix}_BUSY`,
        DONE: `${prefix}_DONE`,
        LO: `${prefix}_LO`,
        HI: `${prefix}_HI`,
        ERROR: `${prefix}_ERROR`,
      },
    });
  }
  for (const [i, name, bits] of [
    [0, "DONE", 1],
    [1, "LO", width],
    [2, "HI", width],
    [3, "ERROR", 2],
  ]) {
    c.mux({
      x: 3790,
      y: 1200 + i * 200,
      width: bits,
      inputs: [`MUL_${name}`, `DIV_${name}`],
      select: "MD_DIV",
      output: `CORE_${name}`,
    });
  }
  for (const [i, name, bits, output] of [
    [0, "LO", width, "LO"],
    [1, "HI", width, "HI"],
    [2, "ERROR", 2, "MD_ERROR"],
  ]) {
    c.register({
      x: 4200,
      y: 1250 + i * 280,
      width: bits,
      input: `CORE_${name}`,
      output,
      enable: "MD_ACK",
    });
  }
  c.constant({ x: 3800, y: 2070, width: 2, net: "NO_ERROR" });
  c.equal({
    x: 4200,
    y: 2070,
    width: 2,
    a: "CORE_ERROR",
    b: "NO_ERROR",
    output: "MD_OK",
  });
  c.mux({
    x: 4050,
    y: 730,
    width,
    inputs: ["LO", "CORE_LO"],
    select: "MD",
    output: "READ_LO",
  });
  c.truncate({
    x: 4050,
    y: 960,
    input: "MD_ERROR",
    inputWidth: 2,
    output: "STATUS_WORD",
    outputWidth: width,
  });
  c.mux({
    x: 4600,
    y: 880,
    width,
    inputs: ["BASE_WRITEBACK", "READ_LO", "HI", "STATUS_WORD"],
    select: "WB_SELECT",
    output: "WRITEBACK",
  });
}

function cpu({ width, children, units, automatic }) {
  const c = new xml.Circuit({
    name: automatic ? "Lavaneko" : "CPU_Test",
    title: `Lavaneko ${width}`,
    inputs: automatic
      ? []
      : [
          ["CLK", 1],
          ["RESET", 1],
        ],
    outputs: [
      ["PC", 16],
      ...Array.from({ length: 4 }, (_, i) => [`REG${i + 1}`, width]),
      ["Z", 1],
      ["C", 1],
      ["halt", 1],
      ["LO", width],
      ["HI", width],
      ["MD_ERROR", 2],
      ["BUSY", 1],
    ],
    ioRight: 5000,
  });
  c.text({ x: 250, y: 60, text: `LAVANEKO ${width}`, size: 32 });
  c.text({
    x: 250,
    y: 105,
    text: "Fetch / decode / operands / execute / memory / writeback",
    size: 18,
  });
  const stages = [
    [300, "01  PROGRAM COUNTER"],
    [850, "02  PROGRAM ROM"],
    [1290, "03  INSTRUCTION"],
    [1650, "04  DECODE"],
    [2200, "05  REGISTERS"],
    [2950, "06  ARITHMETIC"],
    [3500, "07  DATA MEMORY"],
    [3950, "08  WRITEBACK"],
  ];
  for (const [x, text] of stages) c.text({ x, y: 200, text, size: 18 });
  if (automatic) {
    c.comp({
      library: 0,
      name: "Clock",
      x: 300,
      y: 1120,
      attributes: {
        highDuration: 1,
        lowDuration: 1,
        label: "SYSTEM_TICK",
        labelloc: "north",
      },
    });
    c.attach({ x: 300, y: 1120, net: "CLK", side: "right" });
    c.comp({
      library: 5,
      name: "Button",
      x: 300,
      y: 1270,
      attributes: { label: "RESET", labelloc: "north" },
    });
    c.attach({ x: 300, y: 1270, net: "RESET", side: "right" });
  }
  c.sub({
    circuit: children.pc,
    x: 300,
    y: 280,
    nets: { JUMP: "BRANCH", TARGET: "ADDRESS" },
    wired: ["PC"],
  });
  c.sub({
    circuit: children.rom,
    x: 850,
    y: 280,
    nets: { ADDRESS: "PC", INSTRUCTION: "ROM_WORD" },
    wired: ["ADDRESS", "INSTRUCTION"],
  });
  c.register({
    x: 1380,
    y: 350,
    width: width + 16,
    input: "ROM_WORD",
    output: "INSTRUCTION",
    enable: "FETCH",
    trigger: "rising",
    label: "IR",
    wired: ["input", "output"],
  });
  c.sub({
    circuit: children.control,
    x: 1650,
    y: 280,
    nets: { HALT: "halt" },
    wired: ["INSTRUCTION"],
  });
  c.route({
    points: [
      [600, 350],
      [850, 350],
    ],
  });
  c.attach({ x: 720, y: 350, net: "PC", width: 16, side: "down", length: 80 });
  c.route({
    points: [
      [1150, 350],
      [1350, 350],
    ],
  });
  c.route({
    points: [
      [1380, 350],
      [1650, 350],
    ],
  });
  c.sub({
    circuit: children.bank,
    x: 2200,
    y: 280,
    nets: { DATA: "WRITEBACK" },
    wired: ["READ_A", "READ_B"],
  });
  c.sub({
    circuit: children.alu,
    x: 2950,
    y: 280,
    nets: {
      A: "ALU_A",
      B: "ALU_B",
      RESULT: "ALU_RESULT",
      CARRY: "ALU_CARRY",
      ZERO: "ALU_ZERO",
    },
    wired: ["A", "B", "RESULT"],
  });
  c.sub({
    circuit: children.memory,
    x: 3500,
    y: 280,
    nets: { WRITE: "MEM_WRITE", DATA: "READ_B", READ: "RAM_DATA" },
    wired: ["READ"],
  });
  c.sub({
    circuit: children.sequencer,
    x: 1650,
    y: 1600,
    nets: { HALT: "halt" },
  });
  c.mux({
    x: 2750,
    y: 360,
    width,
    inputs: ["IMMEDIATE", "READ_A"],
    select: "A_REG",
    output: "ALU_A",
    wired: [1, "output"],
  });
  c.mux({
    x: 2750,
    y: 520,
    width,
    inputs: ["READ_B", "ZERO_WORD"],
    select: "B_ZERO",
    output: "ALU_B",
    wired: [0, "output"],
  });
  c.route({
    points: [
      [2500, 350],
      [2570, 350],
      [2570, 370],
      [2720, 370],
    ],
  });
  c.route({
    points: [
      [2500, 390],
      [2610, 390],
      [2610, 510],
      [2720, 510],
    ],
  });
  c.attach({
    x: 2610,
    y: 510,
    net: "READ_B",
    width,
    side: "down",
    length: 130,
  });
  c.route({
    points: [
      [2750, 360],
      [2840, 360],
      [2840, 350],
      [2950, 350],
    ],
  });
  c.route({
    points: [
      [2750, 520],
      [2880, 520],
      [2880, 390],
      [2950, 390],
    ],
  });
  c.mux({
    x: 4050,
    y: 530,
    width,
    inputs: ["ALU_RESULT", "RAM_DATA"],
    select: "LOAD",
    output: "BASE_WRITEBACK",
    wired: [0, 1],
  });
  c.route({
    points: [
      [3250, 350],
      [3330, 350],
      [3330, 250],
      [3920, 250],
      [3920, 520],
      [4020, 520],
    ],
  });
  c.route({
    points: [
      [3800, 350],
      [3870, 350],
      [3870, 540],
      [4020, 540],
    ],
  });
  c.constant({ x: 2580, y: 810, width, net: "ZERO_WORD" });
  c.truncate({
    x: 2230,
    y: 1120,
    input: "IMMEDIATE",
    inputWidth: width,
    output: "ADDRESS",
    outputWidth: 16,
  });
  c.text({
    x: 1650,
    y: 1520,
    text: "CLOCK / COMMIT / BRANCH CONTROL",
    size: 18,
  });
  c.text({
    x: 250,
    y: 990,
    text: "Rising edge: fetch   /   Falling edge: execute",
    size: 18,
  });
  c.text({ x: 3000, y: 1100, text: "INDEPENDENT MULTIPLY / DIVIDE", size: 20 });
  multiplyDividePath({ c, width, units });
  return c;
}

function aluVectors({ width }) {
  const mask = (1n << BigInt(width)) - 1n;
  const cases = [
    [0n, 0n],
    [mask, 1n],
    [0n, 1n],
    [0xfn, 1n],
    [0xffn, 1n],
    [0xfffn, 1n],
    [0x7fffn, 1n],
    [mask, mask],
  ];
  let seed = 87123n;
  for (let i = 0; i < 120; i++) {
    seed = (seed * 1664525n + 1013904223n) & mask;
    const a = seed;
    seed = (seed * 1664525n + 1013904223n) & mask;
    cases.push([a, seed]);
  }
  return `${[
    `A[${width}] B[${width}] SUB RESULT[${width}] CARRY ZERO`,
    ...cases.flatMap(([a, b]) =>
      [0, 1].map((sub) => {
        const raw = sub ? a - b : a + b;
        const result = raw & mask;
        const carry = sub ? Number(a >= b) : Number(raw > mask);
        return `0x${a.toString(16)} 0x${b.toString(16)} ${sub} 0x${result.toString(16)} ${carry} ${Number(result === 0n)}`;
      }),
    ),
  ].join("\n")}\n`;
}

function cpuVectors({ width, words }) {
  const header = `CLK RESET PC[16] REG1[${width}] REG2[${width}] REG3[${width}] REG4[${width}] Z C halt LO[${width}] HI[${width}] MD_ERROR[2] BUSY <set> <seq>`;
  let state = isa.initialState();
  let seq = 0;
  const format = ({ clock, reset = 0, halt = 0, busy = 0 }) =>
    `${clock} ${reset} 0x${state.pc.toString(16)} ${state.registers.map((v) => `0x${v.toString(16)}`).join(" ")} ${state.zero} ${state.carry} ${halt} 0x${state.lo.toString(16)} 0x${state.hi.toString(16)} 0x${state.mdError} ${busy} 1 ${++seq}`;
  const rows = [header, format({ clock: 0, reset: 1 }), format({ clock: 0 })];
  let resetDuringMultiply = false;
  for (let step = 0; step < 300; step++) {
    const word = words[state.pc] ?? 0x40n;
    const opcode = Number(word & 255n);
    const md = opcode >= 0xc0 && opcode <= 0xc3;
    const halt = Number(Boolean(word & 0x40n) && !(word & 0x80n));
    rows.push(format({ clock: 1, halt }));
    const next = isa.execute({ state, word, width });
    if (md) {
      rows.push(format({ clock: 0, busy: 1 }));
      if (!resetDuringMultiply) {
        rows.push(format({ clock: 1, busy: 1 }));
        state = isa.initialState();
        rows.push(format({ clock: 1, reset: 1 }));
        rows.push(format({ clock: 0 }));
        resetDuringMultiply = true;
        continue;
      }
      for (let i = 0; i < (next.mdError ? 0 : width); i++) {
        rows.push(format({ clock: 1, busy: 1 }));
        rows.push(format({ clock: 0, busy: 1 }));
      }
      rows.push(format({ clock: 1, busy: 1 }));
    }
    state = next;
    rows.push(format({ clock: 0, halt }));
    if (halt) break;
    if (step === 299) throw new Error("Demo failed to halt");
  }
  rows.push(format({ clock: 1, halt: 1 }));
  rows.push(format({ clock: 0, halt: 1 }));
  state = isa.initialState();
  rows.push(format({ clock: 0, reset: 1 }));
  return `${rows.join("\n")}\n`;
}

function bankVectors({ width }) {
  const rows = [
    `CLK RESET WRITE DEST[2] SELECT_A[2] SELECT_B[2] DATA[${width}] READ_A[${width}] READ_B[${width}] REG1[${width}] REG2[${width}] REG3[${width}] REG4[${width}] <set> <seq>`,
  ];
  let seq = 0;
  let regs = [0, 0, 0, 0];
  function row({
    clock,
    reset = 0,
    write = 0,
    dest = 0,
    a = 0,
    b = 0,
    data = 0,
  }) {
    return `${clock} ${reset} ${write} 0x${dest} 0x${a} 0x${b} 0x${data.toString(16)} 0x${regs[a].toString(16)} 0x${regs[b].toString(16)} ${regs.map((v) => `0x${v.toString(16)}`).join(" ")} 1 ${++seq}`;
  }
  rows.push(row({ clock: 0, reset: 1 }));
  for (const dest of [2, 0, 3, 1]) {
    const data = 0x1111 * (dest + 1);
    rows.push(row({ clock: 1, write: 1, dest, data }));
    regs = regs.map((value, index) => (index === dest ? data : value));
    rows.push(row({ clock: 0, write: 1, dest, data }));
  }
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) rows.push(row({ clock: 0, a, b }));
  rows.push(row({ clock: 1, dest: 0, data: 0xffff }));
  rows.push(row({ clock: 0, dest: 0, data: 0xffff }));
  regs = [0, 0, 0, 0];
  rows.push(row({ clock: 0, reset: 1 }));
  return `${rows.join("\n")}\n`;
}

function generate() {
  return [16, 32].flatMap((width) => {
    const program = isa.extendedDemo({ width });
    const words = program.map(({ word }) => word);
    const units = arithmeticUnits.create({ width });
    const children = {
      alu: modules.addSub({ width }),
      bank: modules.registerBank({ width }),
      pc: modules.programCounter(),
      rom: modules.programRom({ width, words }),
      control: modules.control({ width }),
      memory: modules.memory({ width }),
      sequencer: sequencer(),
    };
    const circuits = [
      ...Object.values(children),
      ...units.circuits,
      cpu({ width, children, units, automatic: true }),
      cpu({ width, children, units, automatic: false }),
    ];
    return [
      {
        path: `logisim/projects/Lavaneko${width}.circ`,
        content: xml.project({ circuits, main: "Lavaneko" }),
      },
      {
        path: `toolchain/programs/legacy${width}.hex`,
        content: `v2.0 raw\n${isa
          .demo({ width })
          .map(({ word }) => word.toString(16))
          .join("\n")}\n`,
      },
      {
        path: `toolchain/programs/demo${width}.hex`,
        content: `v2.0 raw\n${words.map((word) => word.toString(16)).join("\n")}\n`,
      },
      {
        path: `toolchain/programs/demo${width}.json`,
        content: `${JSON.stringify(
          program.map(({ word, ...instruction }, address) => ({
            address,
            ...instruction,
            hex: word.toString(16).padStart((width + 16) / 4, "0"),
          })),
          (_, value) => (typeof value === "bigint" ? value.toString() : value),
          2,
        )}\n`,
      },
      {
        path: `logisim/verification/alu${width}.txt`,
        content: aluVectors({ width }),
      },
      {
        path: `logisim/verification/multiply${width}.txt`,
        content: unitVectors.generate({ width, divide: false }),
      },
      {
        path: `logisim/verification/divide${width}.txt`,
        content: unitVectors.generate({ width, divide: true }),
      },
      {
        path: `logisim/verification/registers${width}.txt`,
        content: bankVectors({ width }),
      },
      {
        path: `logisim/verification/cpu${width}.txt`,
        content: cpuVectors({ width, words }),
      },
    ];
  });
}

export const projects = { generate };
