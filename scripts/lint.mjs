import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Lint estático do frontend (iniciativa 5.7.b). Roda em `npm run lint`,
// no CI (quality.yml) e é auto-coberto por test/lint.test.mjs.
const ROOT = resolve(import.meta.dirname, '..', 'public');

const FORBIDDEN_ALIASES = [
  '--accent-1', '--accent-2', '--text', '--radius', '--shadow', '--shadow-soft',
  '--card-bg', '--muted', '--bg-1', '--bg-2', '--bg-3', '--bg-4'
];

function checkAliases(files) {
  const violations = [];
  for (const file of files.html.concat(files.css, files.js)) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const alias of FORBIDDEN_ALIASES) {
      if (source.includes(`var(${alias})`)) {
        violations.push(`${file}: usa o alias legado ${alias} (use um token --lc-*)`);
      }
    }
  }
  return violations;
}

function checkInlineScripts(files) {
  const violations = [];
  for (const file of files.html) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const inline = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1])
      .filter((body) => body.trim().length > 0);
    if (inline.length > 0) {
      violations.push(`${file}: contém JavaScript inline (externalize por causa da CSP)`);
    }
  }
  return violations;
}

function checkLocalAccountStorage(files) {
  const violations = [];
  for (const file of [...files.html, 'profile-api.js']) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    if (/localStorage\.(?:getItem|setItem|removeItem)\(['"](?:users|currentUser)['"]/.test(source)) {
      violations.push(`${file}: guarda conta no localStorage`);
    }
  }
  return violations;
}

function checkScriptSyntax(files) {
  const violations = [];
  for (const file of files.js) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(readFileSync(join(ROOT, file), 'utf8'));
    } catch {
      violations.push(`${file}: erro de sintaxe em JavaScript`);
    }
  }
  return violations;
}

export function runChecks() {
  const all = { html: [], css: [], js: [] };
  for (const name of readdirSync(ROOT).sort()) {
    if (name.endsWith('.html')) all.html.push(name);
    if (name.endsWith('.css')) all.css.push(name);
    if (name.endsWith('.js')) all.js.push(name);
  }
  return [
    ...checkAliases(all),
    ...checkInlineScripts(all),
    ...checkLocalAccountStorage(all),
    ...checkScriptSyntax(all)
  ];
}

const violations = runChecks();
if (violations.length > 0) {
  for (const violation of violations) console.error(`lint: ${violation}`);
  process.exit(1);
}
console.log('lint: nenhum problema no frontend.');
