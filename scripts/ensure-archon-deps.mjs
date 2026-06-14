#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.env.ARCHON_DEPS_ROOT ?? "/opt/archon-deps";
const packages = [
  ["@openzeppelin/contracts", "5.0.2", "openzeppelin/5", "contracts"],
  ["@openzeppelin/contracts", "4.9.6", "openzeppelin/4", "contracts"],
  ["@openzeppelin/contracts-upgradeable", "5.0.2", "openzeppelin-upgradeable/5", "contracts-upgradeable"],
  ["@openzeppelin/contracts-upgradeable", "4.9.6", "openzeppelin-upgradeable/4", "contracts-upgradeable"],
  ["solmate", "6.8.0", "solmate", "src"],
  ["solady", "0.1.26", "solady", "src"],
  ["forge-std", "1.10.0", "forge-std", "src"],
];

function install([pkg, version, destRel, subdir]) {
  const dest = path.join(root, destRel);
  const target = path.join(dest, subdir);
  if (existsSync(target)) {
    console.log(`archon deps ok: ${target}`);
    return;
  }
  const tmp = mkdtempSync(path.join(tmpdir(), "archon-deps-"));
  try {
    mkdirSync(dest, { recursive: true });
    const pack = execFileSync("npm", ["pack", `${pkg}@${version}`, "--pack-destination", tmp, "--silent"], { encoding: "utf8" }).trim().split("\n").at(-1);
    if (!pack) throw new Error(`npm pack produced no tarball for ${pkg}@${version}`);
    execFileSync("tar", ["-xzf", path.join(tmp, pack), "-C", tmp]);
    const packageRoot = path.join(tmp, "package");
    const nested = path.join(packageRoot, subdir);
    if (existsSync(nested)) {
      cpSync(nested, target, { recursive: true });
    } else {
      mkdirSync(target, { recursive: true });
      for (const name of ["access", "build", "finance", "governance", "interfaces", "metatx", "proxy", "token", "utils", "vendor"]) {
        const item = path.join(packageRoot, name);
        if (existsSync(item)) cpSync(item, path.join(target, name), { recursive: true });
      }
    }
    console.log(`archon deps installed: ${pkg}@${version} -> ${target}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ds-test is forge-std's transitive dependency (forge-std/Test.sol imports
// ds-test/test.sol) but ships as a git submodule, not on npm — clone it so the
// generated Foundry gas harness compiles (V5.2).
function installDsTest() {
  const target = path.join(root, "ds-test", "src");
  if (existsSync(path.join(target, "test.sol"))) { console.log(`archon deps ok: ${target}`); return; }
  const tmp = mkdtempSync(path.join(tmpdir(), "archon-dstest-"));
  try {
    execFileSync("git", ["clone", "--depth", "1", "https://github.com/dapphub/ds-test", tmp], { stdio: "ignore" });
    mkdirSync(path.join(root, "ds-test"), { recursive: true });
    cpSync(path.join(tmp, "src"), target, { recursive: true });
    console.log(`archon deps installed: ds-test -> ${target}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

mkdirSync(root, { recursive: true });
for (const spec of packages) install(spec);
installDsTest();
