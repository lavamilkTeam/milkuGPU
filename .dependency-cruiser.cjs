const packageRoots = ["cpu/isa", "logisim/circuits", "logisim/cli"];

function packageRules({ root }) {
  const name = root.replaceAll("/", "-");
  return [
    {
      name: `${name}-entrypoint-boundary`,
      severity: "error",
      from: { pathNot: `^${root}/` },
      to: { path: `^${root}/[^/]+/` },
    },
    {
      name: `${name}-tests-through-entrypoints`,
      severity: "error",
      from: { path: `^${root}/tests/` },
      to: { path: `^${root}/[^/]+/`, pathNot: `^${root}/tests/` },
    },
    {
      name: `${name}-tests-folder-is-private`,
      severity: "error",
      from: { pathNot: `^${root}/tests/` },
      to: { path: `^${root}/tests/` },
    },
  ];
}

module.exports = {
  forbidden: [
    ...packageRoots.flatMap((root) => packageRules({ root })),
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "isa-is-independent",
      severity: "error",
      from: { path: "^cpu/isa/" },
      to: { path: "^(logisim|toolchain|emulator|studio)/" },
    },
    {
      name: "circuits-do-not-import-apps",
      severity: "error",
      from: { path: "^logisim/circuits/" },
      to: { path: "^(logisim/cli|toolchain|emulator|studio)/" },
    },
    {
      name: "core-does-not-import-studio",
      severity: "error",
      from: { path: "^(cpu|logisim|toolchain|emulator)/" },
      to: { path: "^studio/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      extensions: [".js", ".ts", ".json"],
      conditionNames: ["import", "default"],
    },
  },
};
