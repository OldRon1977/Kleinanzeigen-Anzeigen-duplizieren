#!/usr/bin/env node
/**
 * Synchronizes @version headers in userscript files with package.json.
 *
 * Sources of truth:
 *   - package.json -> "version"        => kleinanzeigen-duplizieren.user.js  @version
 *   - package.json -> "helperVersion"  => helper.user.js                     @version
 *
 * Run: node scripts/build.js   (or: npm run build)
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const targets = [
  {
    file: path.join(repoRoot, "kleinanzeigen-duplizieren.user.js"),
    versionKey: "version",
    label: "main",
  },
  {
    file: path.join(repoRoot, "helper.user.js"),
    versionKey: "helperVersion",
    label: "helper",
  },
];

let changed = 0;

for (const t of targets) {
  const desired = pkg[t.versionKey];
  if (!desired) {
    console.error(`ERROR: package.json is missing "${t.versionKey}".`);
    process.exit(2);
  }

  if (!fs.existsSync(t.file)) {
    console.error(`ERROR: target file not found: ${t.file}`);
    process.exit(2);
  }

  const original = fs.readFileSync(t.file, "utf8");

  const headerEnd = original.indexOf("// ==/UserScript==");
  if (headerEnd === -1) {
    console.error(`ERROR: ${t.label}: no userscript header end (// ==/UserScript==) found.`);
    process.exit(2);
  }
  const header = original.slice(0, headerEnd);
  const body = original.slice(headerEnd);

  const versionRe = /^(\/\/\s*@version\s+)(\S+)(\s*)$/m;
  const match = header.match(versionRe);
  if (!match) {
    console.error(`ERROR: ${t.label}: no @version line in header.`);
    process.exit(2);
  }
  const current = match[2];

  let updatedHeader;
  if (current === desired) {
    updatedHeader = header;
  } else {
    updatedHeader = header.replace(versionRe, `$1${desired}$3`);
    changed++;
  }

  const updated = updatedHeader + body;

  if (updated === original) {
    console.log(`OK   ${t.label.padEnd(8)} @version=${current} (no change)`);
  } else {
    fs.writeFileSync(t.file, updated, "utf8");
    console.log(`SYNC ${t.label.padEnd(8)} @version ${current} -> ${desired}`);
  }
}

if (changed === 0) {
  console.log("All userscript headers already in sync with package.json.");
}