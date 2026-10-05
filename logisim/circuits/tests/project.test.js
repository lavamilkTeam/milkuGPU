import assert from "node:assert/strict";
import { test } from "node:test";
import { projects } from "../index.js";

test("both width variants generate public projects and executable verification vectors", () => {
  const files = projects.generate();
  for (const width of [16, 32]) {
    const project = files.find(({ path }) =>
      path.endsWith(`Lavaneko${width}.circ`),
    );
    assert.ok(project);
    assert.match(project.content, /<main name="Lavaneko"\/>/);
    assert.match(project.content, /name="CPU_Test"/);
    assert.equal(project.content.includes('name="Multiplier"'), false);
    assert.equal(project.content.includes('name="Divider"'), false);
    assert.ok(
      files.some(({ path }) => path === `logisim/verification/cpu${width}.txt`),
    );
  }
});
