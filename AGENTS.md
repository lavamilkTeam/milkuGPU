# Lavaneko

This is a cpu/hardware/CPU monorepo, separate from the archived EcAI/Activepieces project.

- Invoke code-boundary-standards before writing, reviewing, or testing code.
- Read docs/architecture.md before changing circuit boundaries or the instruction format.
- Package root entry points are public. lib/ and tests/ are private. Import workspace packages by their declared package exports.
- Read docs/modules.md for monorepo layout and module boundaries.
- Dependencies flow from logisim/cli to logisim/circuits to cpu/isa. ISA must not depend on Logisim, toolchain, emulator or Studio.
- Toolchain owns compilation, assembly and linking; emulator owns execution; Studio owns the desktop UI and integration. Keep these separate from circuit generation.
- Keep circuit source and reproducible generated .circ artifacts together. Do not claim screenshot reconstruction is an exact recovery of missing original subcircuits.
- Run npm run lint-dev, npm test, npm run build, and npm run verify:logisim before completion.
- Use named parameter objects for multi-argument functions. No any, forced type casts, or explanatory source comments.
- No CPU behavior in a microcontroller, FPGA, or opaque custom Java component. Logisim subcircuits must remain inspectable.
- Physical PCB designs must fit 100 x 100 mm per board, stack vertically, and follow pcb-routing-standards. Simulation artifacts are not manufacturing-ready schematics.
