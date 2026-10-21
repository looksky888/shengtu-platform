import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(webRoot, "src");
const quotedUnicodeAttribute = /[A-Za-z_:][-A-Za-z0-9_:]*="[^"]*\\u[0-9a-fA-F]{4}/g;

function sourceFiles(directory: string, exts = [".jsx", ".tsx"]): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, exts);
    return exts.includes(extname(entry.name)) ? [path] : [];
  });
}

test("JSX quoted attributes do not contain literal Unicode escapes", () => {
  const violations = sourceFiles(sourceRoot).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return [...source.matchAll(quotedUnicodeAttribute)].map((match) => (
      `${relative(webRoot, path)}:${source.slice(0, match.index).split("\n").length}:${match[0]}`
    ));
  });

  assert.deepEqual(violations, []);
});

test("TS and TSX sources do not contain CJK Unicode escapes", () => {
  const cjkUnicodeEscape = /\\u[4-9a-fA-F][0-9a-fA-F]{3}/g;
  const violations = sourceFiles(sourceRoot, [".ts", ".tsx"]).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return [...source.matchAll(cjkUnicodeEscape)].map((match) => (
      `${relative(webRoot, path)}:${source.slice(0, match.index).split("\n").length}:${match[0]}`
    ));
  });

  assert.deepEqual(violations, []);
});
