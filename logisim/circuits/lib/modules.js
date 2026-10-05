import { xml } from "./xml.js";

function addSub({ width }) {
  const c = new xml.Circuit({
    name: "AddSub",
    title: `${width}-bit add / subtract`,
    inputs: [
      ["A", width],
      ["B", width],
      ["SUB", 1],
    ],
    outputs: [
      ["RESULT", width],
      ["CARRY", 1],
      ["ZERO", 1],
    ],
  });
  c.text({
    x: 210,
    y: 40,
    text: "4-bit adder slices; subtraction = A + complement(B) + 1",
  });
  c.invert({ x: 400, y: 120, width, input: "B", output: "NOT_B" });
  c.mux({
    x: 700,
    y: 120,
    width,
    inputs: ["B", "NOT_B"],
    select: "SUB",
    output: "B_EFFECTIVE",
  });
  const count = width / 4;
  c.split({
    x: 300,
    y: 400,
    width,
    input: "A",
    groups: Array.from({ length: count }, (_, i) => [`A${i}`, 4]),
  });
  c.split({
    x: 570,
    y: 400,
    width,
    input: "B_EFFECTIVE",
    groups: Array.from({ length: count }, (_, i) => [`B${i}`, 4]),
  });
  c.split({
    x: 900,
    y: 400,
    width,
    input: "RESULT",
    groups: Array.from({ length: count }, (_, i) => [`S${i}`, 4]),
  });
  for (let i = 0; i < count; i++) {
    const x = 330 + (i % 4) * 270;
    const y = 700 + Math.floor(i / 4) * 180;
    c.text({ x: x - 60, y: y - 85, text: `Bits ${i * 4 + 3}:${i * 4}` });
    c.adder({
      x,
      y,
      width: 4,
      a: `A${i}`,
      b: `B${i}`,
      carryIn: i ? `C${i}` : "SUB",
      sum: `S${i}`,
      carryOut: i === count - 1 ? "CARRY" : `C${i + 1}`,
    });
  }
  c.constant({ x: 300, y: 1030, width, net: "ZERO_WORD" });
  c.equal({
    x: 700,
    y: 1030,
    width,
    a: "RESULT",
    b: "ZERO_WORD",
    output: "ZERO",
  });
  return c;
}

function registerBank({ width }) {
  const c = new xml.Circuit({
    name: "RegisterBank",
    title: `4 x ${width} register bank`,
    inputs: [
      ["CLK", 1],
      ["RESET", 1],
      ["WRITE", 1],
      ["DEST", 2],
      ["SELECT_A", 2],
      ["SELECT_B", 2],
      ["DATA", width],
    ],
    outputs: [
      ["READ_A", width],
      ["READ_B", width],
      ...Array.from({ length: 4 }, (_, i) => [`REG${i + 1}`, width]),
    ],
  });
  c.text({
    x: 210,
    y: 40,
    text: "Independent read A / read B / write destination; falling-edge commit",
  });
  for (let i = 0; i < 4; i++) {
    const y = 140 + i * 180;
    c.constant({ x: 270, y: y - 50, width: 2, value: i, net: `INDEX${i}` });
    c.equal({
      x: 390,
      y,
      width: 2,
      a: "DEST",
      b: `INDEX${i}`,
      output: `SELECTED${i}`,
    });
    c.gate({ x: 640, y, a: `SELECTED${i}`, b: "WRITE", output: `WE${i}` });
    c.register({
      x: 920,
      y,
      width,
      input: "DATA",
      output: `REG${i + 1}`,
      enable: `WE${i}`,
    });
  }
  c.mux({
    x: 500,
    y: 940,
    width,
    inputs: ["REG1", "REG2", "REG3", "REG4"],
    select: "SELECT_A",
    output: "READ_A",
  });
  c.mux({
    x: 900,
    y: 940,
    width,
    inputs: ["REG1", "REG2", "REG3", "REG4"],
    select: "SELECT_B",
    output: "READ_B",
  });
  return c;
}

function programCounter() {
  const c = new xml.Circuit({
    name: "ProgramCounter",
    title: "16-bit program counter",
    inputs: [
      ["CLK", 1],
      ["RESET", 1],
      ["ENABLE", 1],
      ["JUMP", 1],
      ["TARGET", 16],
    ],
    outputs: [["PC", 16]],
  });
  c.constant({ x: 280, y: 120, width: 16, value: 1, net: "ONE" });
  c.constant({ x: 280, y: 200, net: "ZERO" });
  c.adder({
    x: 490,
    y: 360,
    width: 16,
    a: "PC",
    b: "ONE",
    carryIn: "ZERO",
    sum: "NEXT",
    carryOut: "WRAP",
  });
  c.mux({
    x: 750,
    y: 360,
    width: 16,
    inputs: ["NEXT", "TARGET"],
    select: "JUMP",
    output: "PC_D",
  });
  c.register({
    x: 1000,
    y: 360,
    width: 16,
    input: "PC_D",
    output: "PC",
    enable: "ENABLE",
  });
  return c;
}

function programRom({ width, words }) {
  const c = new xml.Circuit({
    name: "ProgramROM",
    title: "Program ROM",
    inputs: [["ADDRESS", 16]],
    outputs: [["INSTRUCTION", width + 16]],
  });
  c.comp({
    library: 4,
    name: "ROM",
    x: 400,
    y: 140,
    attributes: {
      addrWidth: 16,
      dataWidth: width + 16,
      appearance: "classic",
      label: "PROGRAM",
      labelvisible: true,
    },
    textAttributes: {
      contents: `addr/data: 16 ${width + 16}\n${words.map((word) => word.toString(16)).join(" ")}\n`,
    },
  });
  c.attach({ x: 400, y: 150, net: "ADDRESS", width: 16 });
  c.attach({
    x: 640,
    y: 200,
    net: "INSTRUCTION",
    width: width + 16,
    side: "right",
  });
  c.text({
    x: 300,
    y: 340,
    text: "Program words = low 16 control bits + full-width immediate",
  });
  c.text({
    x: 300,
    y: 380,
    text: "Edit PROGRAM contents to load your own reconstructed control words",
  });
  return c;
}

function control({ width }) {
  const groups = [
    ["SUB", 1],
    ["REG_WRITE", 1],
    ["LOAD", 1],
    ["STORE", 1],
    ["JUMP", 1],
    ["B_ZERO", 1],
    ["HALT", 1],
    ["A_REG", 1],
    ["SELECT_B", 2],
    ["DEST", 2],
    ["SELECT_A", 2],
    ["FLAGS_WRITE", 1],
    ["JZ", 1],
    ["IMMEDIATE", width],
  ];
  const masked = [
    "REG_WRITE",
    "LOAD",
    "STORE",
    "JUMP",
    "HALT",
    "FLAGS_WRITE",
    "JZ",
  ];
  const c = new xml.Circuit({
    name: "Control",
    title: "Control / extended opcode decode",
    inputs: [["INSTRUCTION", width + 16]],
    outputs: [
      ...groups,
      ["MD", 1],
      ["MD_SIGNED", 1],
      ["MD_DIV", 1],
      ["WB_SELECT", 2],
    ],
    ioRight: 2900,
  });
  c.split({
    x: 450,
    y: 430,
    width: width + 16,
    input: "INSTRUCTION",
    groups: groups.map(([net, bits]) => [
      masked.includes(net) ? `RAW_${net}` : net,
      bits,
    ]),
    spacing: 4,
  });
  c.gate({ x: 800, y: 180, a: "RAW_HALT", b: "A_REG", output: "EXT" });
  c.invert({ x: 800, y: 280, input: "EXT", output: "LEGACY" });
  masked.forEach((net, i) => {
    c.gate({
      x: 1150,
      y: 140 + i * 130,
      a: `RAW_${net}`,
      b: "LEGACY",
      output: net === "REG_WRITE" ? "LEGACY_WRITE" : net,
    });
  });
  c.truncate({
    x: 800,
    y: 1000,
    input: "INSTRUCTION",
    inputWidth: width + 16,
    output: "OPCODE",
    outputWidth: 8,
  });
  for (let i = 0; i < 7; i++) {
    c.constant({
      x: 1500,
      y: 150 + i * 140,
      width: 8,
      value: 0xc0 + i,
      net: `CODE_${i}`,
    });
    c.equal({
      x: 1920,
      y: 150 + i * 140,
      width: 8,
      a: "OPCODE",
      b: `CODE_${i}`,
      output: `EXT_${i}`,
    });
  }
  const gates = [
    ["EXT_0", "EXT_1", "IS_MUL"],
    ["EXT_2", "EXT_3", "MD_DIV"],
    ["IS_MUL", "MD_DIV", "MD"],
    ["EXT_1", "EXT_3", "MD_SIGNED"],
    ["MD", "EXT_4", "SELECT_LO"],
    ["SELECT_LO", "EXT_6", "WB_BIT_0"],
    ["EXT_5", "EXT_6", "WB_BIT_1"],
    ["WB_BIT_0", "WB_BIT_1", "EXT_WRITE"],
    ["LEGACY_WRITE", "EXT_WRITE", "REG_WRITE"],
  ];
  gates.forEach(([a, b, output], i) => {
    c.gate({ x: 2450, y: 150 + i * 140, kind: "OR Gate", a, b, output });
  });
  c.split({
    x: 1900,
    y: 1260,
    width: 2,
    input: "WB_SELECT",
    groups: [
      ["WB_BIT_0", 1],
      ["WB_BIT_1", 1],
    ],
  });
  return c;
}

function memory({ width }) {
  const c = new xml.Circuit({
    name: "DataRAM",
    title: `64K x ${width} data RAM`,
    inputs: [
      ["CLK", 1],
      ["RESET", 1],
      ["WRITE", 1],
      ["ADDRESS", 16],
      ["DATA", width],
    ],
    outputs: [["READ", width]],
  });
  c.comp({
    library: 4,
    name: "RAM",
    x: 460,
    y: 160,
    attributes: {
      addrWidth: 16,
      dataWidth: width,
      appearance: "classic",
      databus: "bibus",
      enables: "line",
      line: "single",
      trigger: "falling",
      clearpin: true,
      label: "DATA_RAM",
      labelvisible: true,
    },
  });
  const inputRoutes = [
    [170, 100, "ADDRESS", 16],
    [190, 180, "WRITE", 1],
    [200, 250, "CLK", 1],
    [220, 320, "DATA", width],
  ];
  inputRoutes.forEach(([pinY, endY, net, bits], index) => {
    const bendX = 420 - index * 10;
    c.route({
      points: [
        [460, pinY],
        [bendX, pinY],
        [bendX, endY],
        [350, endY],
      ],
    });
    c.attach({ x: 350, y: endY, net, width: bits });
  });
  c.attach({ x: 500, y: 160, net: "RESET", side: "up" });
  c.attach({ x: 700, y: 220, net: "READ", width, side: "right" });
  return c;
}

export const modules = {
  addSub,
  registerBank,
  programCounter,
  programRom,
  control,
  memory,
};
