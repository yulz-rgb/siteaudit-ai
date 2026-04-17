import { execSync } from "node:child_process";
import fs from "node:fs";

function run(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  } catch {
    return null;
  }
}

function check(name, condition, fix) {
  if (condition) {
    console.log(`✅ ${name}`);
    return true;
  }
  console.log(`❌ ${name}`);
  if (fix) console.log(`   ↳ ${fix}`);
  return false;
}

const checks = [];

checks.push(
  check(
    "Git repository initialized",
    fs.existsSync(".git"),
    "Run: git init"
  )
);

checks.push(
  check(
    "Git remote origin configured",
    Boolean(run("git remote get-url origin")),
    "Run: git remote add origin <your-repo-url>"
  )
);

checks.push(
  check(
    "Vercel CLI available",
    Boolean(run("npx vercel --version")),
    "Run: npm i -D vercel or ensure npx can access it"
  )
);

checks.push(
  check(
    "Node.js version >= 18",
    (() => {
      const version = process.versions.node.split(".").map(Number);
      return version[0] >= 18;
    })(),
    "Install Node 18+"
  )
);

checks.push(
  check(
    ".env.local exists for local development",
    fs.existsSync(".env.local"),
    "Copy .env.example to .env.local"
  )
);

const allGood = checks.every(Boolean);
if (!allGood) {
  console.log("\nPreflight failed. Fix the items above, then rerun: npm run doctor");
  process.exit(1);
}

console.log("\nAll checks passed. You can run: npm run ship");
