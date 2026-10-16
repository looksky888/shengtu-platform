import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(
  webRoot,
  process.env.WEB_DIST_DIR || "../internal/web/dist",
);
const sourceRoots = ["src", "public", "scripts"];
const sourceFiles = [
  ".npmrc",
  "components.json",
  "eslint.config.mjs",
  "index.html",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
  "vite.config.ts",
];

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function collectFiles(relativeRoot) {
  const absoluteRoot = path.join(webRoot, relativeRoot);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => comparePaths(left.name, right.name))) {
    const relativePath = path.posix.join(relativeRoot.replaceAll(path.sep, "/"), entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function getSourceFiles() {
  const files = new Set(sourceFiles);
  for (const root of sourceRoots) {
    for (const file of await collectFiles(root)) {
      files.add(file);
    }
  }
  return [...files].sort(comparePaths);
}

async function calculateSourceHash(files) {
  const hash = createHash("sha256");
  for (const relativePath of files) {
    const content = await fs.readFile(path.join(webRoot, relativePath));
    hash.update(relativePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function getAppVersion() {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    const releaseVersion = (await fs.readFile(path.resolve(webRoot, "../VERSION.txt"), "utf8")).trim();
    if (releaseVersion) return releaseVersion;
  } catch {
    // Package metadata remains the fallback for standalone web copies.
  }
  return process.env.npm_package_version || "0.0.0-dev";
}

async function buildManifest() {
  const files = await getSourceFiles();
  return {
    schemaVersion: 1,
    algorithm: "sha256(path\\0content\\0)",
    sourceHash: await calculateSourceHash(files),
    files,
    appVersion: await getAppVersion(),
  };
}

async function writeManifest() {
  await fs.mkdir(distDir, { recursive: true });
  const manifest = await buildManifest();
  await fs.writeFile(
    path.join(distDir, "build-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${path.relative(webRoot, path.join(distDir, "build-manifest.json"))}`);
}

async function verifyManifest() {
  const manifestPath = path.join(distDir, "build-manifest.json");
  let embedded;
  try {
    embedded = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`frontend build manifest missing or invalid: ${manifestPath}`, {
      cause: error,
    });
  }
  const current = await buildManifest();
  const sameFiles = JSON.stringify(embedded.files) === JSON.stringify(current.files);
  if (
    embedded.schemaVersion !== current.schemaVersion ||
    embedded.algorithm !== current.algorithm ||
    !sameFiles ||
    embedded.sourceHash !== current.sourceHash
  ) {
    throw new Error(
      `frontend dist is stale: expected ${current.sourceHash}, found ${embedded.sourceHash || "missing"}`,
    );
  }
  console.log(`Verified frontend dist source hash ${current.sourceHash}`);
}

const command = process.argv[2] || "verify";
if (command === "write") {
  await writeManifest();
} else if (command === "verify") {
  await verifyManifest();
} else {
  throw new Error(`unknown command: ${command}; use write or verify`);
}
