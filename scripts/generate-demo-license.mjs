import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";
// Share the browser implementation without requiring a build or a TS runtime.
const source = await readFile(new URL("../src/license.ts", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "license.ts");
const { signLicense, demoPayload } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
console.log(await signLicense(demoPayload()));
