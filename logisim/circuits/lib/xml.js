function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function element({ tag, attributes = {}, children = "" }) {
  const attributesText = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join("");
  return children
    ? `<${tag}${attributesText}>${children}</${tag}>`
    : `<${tag}${attributesText}/>`;
}

function attribute({ name, value }) {
  return element({ tag: "a", attributes: { name, val: value } });
}

function point({ x, y }) {
  return `(${x},${y})`;
}

class Circuit {
  constructor({
    name,
    inputs = [],
    outputs = [],
    title = name,
    ioRight = 1200,
  }) {
    this.name = name;
    this.title = title;
    this.parts = [];
    this.ports = [];
    for (const [output, definitions] of [
      [false, inputs],
      [true, outputs],
    ]) {
      definitions.forEach(([label, width], index) => {
        const x = output ? ioRight : 40;
        const y = 100 + index * 50;
        this.comp({
          library: 0,
          name: "Pin",
          x,
          y,
          attributes: {
            appearance: "classic",
            facing: output ? "west" : "east",
            output,
            width,
            label,
            labelloc: output ? "east" : "west",
            radix: width > 1 ? "16" : "2",
          },
        });
        this.attach({
          x,
          y,
          net: label,
          width,
          side: output ? "left" : "right",
        });
        this.ports.push({
          label,
          width,
          output,
          x,
          y,
          dx: output ? 300 : 0,
          dy: 70 + index * 40,
        });
      });
    }
  }

  comp({ library, name, x, y, attributes = {}, textAttributes = {} }) {
    const attrs = { loc: point({ x, y }), name };
    if (library !== undefined) attrs.lib = library;
    this.parts.push(
      element({
        tag: "comp",
        attributes: attrs,
        children:
          Object.entries(attributes)
            .map(([name, value]) => attribute({ name, value }))
            .join("") +
          Object.entries(textAttributes)
            .map(([name, text]) =>
              element({
                tag: "a",
                attributes: { name },
                children: escapeXml(text),
              }),
            )
            .join(""),
      }),
    );
  }

  wire({ from, to }) {
    if (from.x === to.x && from.y === to.y) return;
    if (from.x !== to.x && from.y !== to.y)
      throw new Error("Circuit wires must be orthogonal");
    this.parts.push(
      element({
        tag: "wire",
        attributes: { from: point(from), to: point(to) },
      }),
    );
  }

  attach({ x, y, net, width = 1, side = "left", length = 30 }) {
    const tx = side === "left" ? x - length : side === "right" ? x + length : x;
    const ty = side === "up" ? y - length : side === "down" ? y + length : y;
    this.wire({ from: { x, y }, to: { x: tx, y: ty } });
    this.comp({
      library: 0,
      name: "Tunnel",
      x: tx,
      y: ty,
      attributes: {
        facing:
          side === "left"
            ? "east"
            : side === "right"
              ? "west"
              : side === "up"
                ? "south"
                : "north",
        width,
        label: net,
        labelfont: "SansSerif plain 12",
      },
    });
  }

  text({ x, y, text, size = 14 }) {
    this.comp({
      library: 8,
      name: "Text",
      x,
      y,
      attributes: { text, font: `SansSerif plain ${size}`, halign: "left" },
    });
  }

  constant({ x, y, width = 1, value = 0, net }) {
    this.comp({
      library: 0,
      name: "Constant",
      x,
      y,
      attributes: { width, value: `0x${BigInt(value).toString(16)}` },
    });
    this.attach({ x, y, net, width, side: "right" });
  }

  register({
    x,
    y,
    width,
    input,
    output,
    enable,
    clock = "CLK",
    reset = "RESET",
    trigger = "falling",
    label = output,
    wired = [],
  }) {
    this.comp({
      library: 4,
      name: "Register",
      x,
      y,
      attributes: {
        width,
        appearance: "classic",
        trigger,
        label,
        labelloc: "north",
        showLabel: true,
      },
    });
    if (!wired.includes("input"))
      this.attach({ x: x - 30, y, net: input, width });
    if (!wired.includes("output"))
      this.attach({ x, y, net: output, width, side: "right" });
    this.wire({ from: { x: x - 30, y: y + 10 }, to: { x: x - 50, y: y + 10 } });
    this.wire({ from: { x: x - 50, y: y + 10 }, to: { x: x - 50, y: y + 40 } });
    this.attach({ x: x - 50, y: y + 40, net: enable });
    this.attach({ x: x - 20, y: y + 20, net: clock, side: "down", length: 30 });
    this.attach({ x: x - 10, y: y + 20, net: reset, side: "down", length: 60 });
  }

  mux({ x, y, width, inputs, select, output, label = "", wired = [] }) {
    const count = inputs.length;
    this.comp({
      library: 2,
      name: "Multiplexer",
      x,
      y,
      attributes: {
        width,
        select: Math.log2(count),
        enable: false,
        size: 40,
        label,
      },
    });
    inputs.forEach((net, index) => {
      if (wired.includes(index)) return;
      const px = x - (count === 2 ? 30 : 40);
      const py =
        y + (count === 2 ? -10 : -count * 5) + index * (count === 2 ? 20 : 10);
      if (count === 2) {
        this.attach({ x: px, y: py, net, width });
      } else {
        const endY = y - 60 + index * 40;
        this.route({
          points: [
            [px, py],
            [x - 70 - index * 20, py],
            [x - 70 - index * 20, endY],
            [x - 160, endY],
          ],
        });
        this.attach({ x: x - 160, y: endY, net, width });
      }
    });
    this.attach({
      x: x - 20,
      y: y + (count === 2 ? 20 : count * 5),
      net: select,
      width: Math.log2(count),
      side: "down",
    });
    if (!wired.includes("output"))
      this.attach({ x, y, net: output, width, side: "right" });
  }

  gate({ x, y, kind = "AND Gate", a, b, output, width = 1 }) {
    this.comp({
      library: 1,
      name: kind,
      x,
      y,
      attributes: { width, inputs: 2, size: 50 },
    });
    this.attach({ x: x - 50, y: y - 20, net: a, width });
    this.attach({ x: x - 50, y: y + 20, net: b, width });
    this.attach({ x, y, net: output, width, side: "right" });
  }

  invert({ x, y, width = 1, input, output }) {
    this.comp({
      library: 1,
      name: "NOT Gate",
      x,
      y,
      attributes: { width, size: 30 },
    });
    this.attach({ x: x - 30, y, net: input, width });
    this.attach({ x, y, net: output, width, side: "right" });
  }

  equal({ x, y, width, a, b, output }) {
    this.comp({
      library: 3,
      name: "Comparator",
      x,
      y,
      attributes: { width, mode: "unsigned" },
    });
    this.attach({ x: x - 40, y: y - 10, net: a, width });
    this.attach({ x: x - 40, y: y + 10, net: b, width });
    this.attach({ x, y, net: output, side: "right" });
  }

  adder({ x, y, width, a, b, carryIn, sum, carryOut }) {
    this.comp({ library: 3, name: "Adder", x, y, attributes: { width } });
    this.attach({ x: x - 40, y: y - 10, net: a, width });
    this.attach({ x: x - 40, y: y + 10, net: b, width });
    this.attach({ x: x - 20, y: y - 20, net: carryIn, side: "up", length: 40 });
    this.attach({
      x: x - 20,
      y: y + 20,
      net: carryOut,
      side: "down",
      length: 40,
    });
    this.attach({ x, y, net: sum, width, side: "right" });
  }

  split({ x, y, width, input, groups, spacing = 3 }) {
    if (groups.reduce((sum, group) => sum + group[1], 0) !== width)
      throw new Error("Splitter widths do not match");
    const attributes = {
      facing: "east",
      fanout: groups.length,
      incoming: width,
      appear: "center",
      spacing,
    };
    let bit = 0;
    groups.forEach(([, count], index) => {
      for (let i = 0; i < count; i++) attributes[`bit${bit++}`] = index;
    });
    this.comp({ library: 0, name: "Splitter", x, y, attributes });
    this.attach({ x, y, net: input, width });
    groups.forEach(([net, bits], index) => {
      this.attach({
        x: x + 20,
        y:
          y -
          spacing * 10 * Math.floor(groups.length / 2) +
          index * spacing * 10,
        net,
        width: bits,
        side: "right",
      });
    });
  }

  truncate({ x, y, input, inputWidth, output, outputWidth }) {
    this.comp({
      library: 0,
      name: "Bit Extender",
      x,
      y,
      attributes: {
        in_width: inputWidth,
        out_width: outputWidth,
        type: "zero",
      },
    });
    this.attach({ x: x - 40, y, net: input, width: inputWidth });
    this.attach({ x, y, net: output, width: outputWidth, side: "right" });
  }

  route({ points }) {
    for (let i = 1; i < points.length; i++) {
      this.wire({
        from: { x: points[i - 1][0], y: points[i - 1][1] },
        to: { x: points[i][0], y: points[i][1] },
      });
    }
  }

  sub({ circuit, x, y, nets = {}, label = "", wired = [] }) {
    this.comp({
      name: circuit.name,
      x,
      y,
      attributes: { label, labelloc: "north" },
    });
    for (const port of circuit.ports) {
      if (wired.includes(port.label)) continue;
      this.attach({
        x: x + port.dx,
        y: y + port.dy,
        net: nets[port.label] ?? port.label,
        width: port.width,
        side: port.output ? "right" : "left",
      });
    }
  }

  render() {
    const height = Math.max(
      140,
      70 +
        Math.max(
          this.ports.filter((port) => port.output).length,
          this.ports.filter((port) => !port.output).length,
        ) *
          40,
    );
    const appearance = element({
      tag: "appear",
      children: [
        element({
          tag: "rect",
          attributes: {
            x: 0,
            y: 0,
            width: 300,
            height,
            fill: "#ffffff",
            stroke: "#28384d",
            "stroke-width": 2,
          },
        }),
        element({
          tag: "text",
          attributes: {
            x: 150,
            y: 30,
            "text-anchor": "middle",
            "font-family": "SansSerif",
            "font-size": 16,
            fill: "#28384d",
          },
          children: escapeXml(this.title),
        }),
        ...this.ports.flatMap((port) => [
          element({
            tag: "text",
            attributes: {
              x: port.output ? 290 : 10,
              y: port.dy + 4,
              "text-anchor": port.output ? "end" : "start",
              "font-family": "SansSerif",
              "font-size": 12,
            },
            children: escapeXml(port.label),
          }),
          element({
            tag: "circ-port",
            attributes: {
              x: port.dx,
              y: port.dy,
              dir: port.output ? "out" : "in",
              pin: `${port.x},${port.y}`,
            },
          }),
        ]),
        element({
          tag: "circ-anchor",
          attributes: { x: 0, y: 0, facing: "east" },
        }),
      ].join(""),
    });
    return element({
      tag: "circuit",
      attributes: { name: this.name },
      children:
        attribute({ name: "appearance", value: "custom" }) +
        attribute({ name: "circuit", value: this.name }) +
        attribute({ name: "simulationFrequency", value: "2.0" }) +
        appearance +
        this.parts.join(""),
    });
  }
}

function project({ circuits, main }) {
  const libraries = [
    "Wiring",
    "Gates",
    "Plexers",
    "Arithmetic",
    "Memory",
    "I/O",
    "TTL",
    "TCL",
    "Base",
  ];
  const content =
    libraries
      .map((name, index) =>
        element({ tag: "lib", attributes: { desc: `#${name}`, name: index } }),
      )
      .join("") +
    element({ tag: "main", attributes: { name: main } }) +
    element({
      tag: "options",
      children:
        attribute({ name: "gateUndefined", value: "error" }) +
        attribute({ name: "simlimit", value: 10000 }) +
        attribute({ name: "simrand", value: 0 }),
    }) +
    element({
      tag: "toolbar",
      children: ["Poke Tool", "Edit Tool", "Wiring Tool", "Text Tool"]
        .map((name) => element({ tag: "tool", attributes: { lib: 8, name } }))
        .join(""),
    }) +
    circuits.map((circuit) => circuit.render()).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${element({ tag: "project", attributes: { source: "5.0.0", version: "1.0" }, children: content })}\n`;
}

export const xml = { Circuit, project };
