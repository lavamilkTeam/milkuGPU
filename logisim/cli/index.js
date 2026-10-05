import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projects } from "@lavaneko/circuits";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] ?? "build";
if (command === "build") {
  for (const artifact of projects.generate()) {
    const target = resolve(root, artifact.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, artifact.content);
    console.log(artifact.path);
  }
} else if (command === "verify") {
  const executable =
    process.env.LOGISIM_EXECUTABLE ??
    "/Applications/Logisim-evolution.app/Contents/MacOS/Logisim-evolution";
  for (const width of [16, 32]) {
    for (const [circuit, vector] of [
      ["AddSub", "alu"],
      ["RegisterBank", "registers"],
      ["MultiplyUnit", "multiply"],
      ["DivideUnit", "divide"],
      ["CPU_Test", "cpu"],
    ]) {
      const result = spawnSync(
        executable,
        [
          "--locale",
          "en",
          "--test-vector",
          circuit,
          resolve(root, `logisim/verification/${vector}${width}.txt`),
          resolve(root, `logisim/projects/Lavaneko${width}.circ`),
        ],
        { encoding: "utf8", timeout: 180000 },
      );
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      await writeFile(
        resolve(root, `logisim/verification/${vector}${width}.log`),
        output,
      );
      console.log(
        `${width}-bit ${circuit}: ${output.match(/Passed:.*Failed:.*$/m)?.[0] ?? output}`,
      );
      if (
        result.error ||
        result.status !== 0 ||
        !/Passed:\s*[1-9]\d*, Failed:\s*0/.test(output) ||
        /Failed:\s*[1-9]|[1-9]\d* failed|error|exception/i.test(output)
      )
        process.exit(1);
    }
  }
} else {
  throw new Error(`Unknown command ${command}`);
}
