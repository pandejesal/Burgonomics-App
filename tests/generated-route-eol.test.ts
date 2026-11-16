import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("keeps the generated route tree LF even in Windows autocrlf checkouts", () => {
  const repo = fileURLToPath(new URL("../", import.meta.url));
  const fields = execFileSync(
    "git",
    [
      "-C",
      repo,
      "-c",
      "core.autocrlf=true",
      "check-attr",
      "-z",
      "text",
      "eol",
      "--",
      "src/routeTree.gen.ts",
    ],
    { encoding: "utf8", windowsHide: true },
  ).split("\0");
  expect(fields[1]).toBe("text");
  expect(fields[2]).toBe("set");
  expect(fields[4]).toBe("eol");
  expect(fields[5]).toBe("lf");
});
