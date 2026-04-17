#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const VERSION = '0.1.0';

function usage() {
  console.log(`agents-md-gen v${VERSION}

Usage:
  agents-md-gen [directory] [options]

Options:
  --output <file>   Write to this file instead of AGENTS.md
  --stdout          Print to stdout instead of writing a file
  --overwrite       Overwrite an existing AGENTS.md
  --version         Print version
  --help            Print this help
`);
}

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function readTOML(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function tomlGet(src, key) {
  // Matches `key = "value"`, `key = 'value'`, with optional leading whitespace.
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'm');
  const m = src.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

function detectNode(dir) {
  const pkg = readJSON(join(dir, 'package.json'));
  if (!pkg) return null;

  const scripts = pkg.scripts || {};
  const commands = {};

  if (scripts.install || pkg.dependencies || pkg.devDependencies) {
    const hasYarnLock = existsSync(join(dir, 'yarn.lock'));
    const hasPnpmLock = existsSync(join(dir, 'pnpm-lock.yaml'));
    const hasBunLock = existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'));
    commands.install = hasPnpmLock ? 'pnpm install' : hasBunLock ? 'bun install' : hasYarnLock ? 'yarn' : 'npm install';
  }

  const runPrefix = commands.install?.startsWith('pnpm') ? 'pnpm' :
                    commands.install?.startsWith('bun') ? 'bun' :
                    commands.install?.startsWith('yarn') ? 'yarn' : 'npm run';

  if (scripts.build) commands.build = `${runPrefix} build`;
  if (scripts.dev) commands.dev = `${runPrefix} dev`;
  if (scripts.start) commands.start = `${runPrefix} start`;
  if (scripts.test) commands.test = `${runPrefix} test`;
  if (scripts.lint) commands.lint = `${runPrefix} lint`;
  if (scripts.format) commands.format = `${runPrefix} format`;
  if (scripts['type-check'] || scripts.typecheck) {
    commands.typecheck = `${runPrefix} ${scripts['type-check'] ? 'type-check' : 'typecheck'}`;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const linters = [];
  if (deps.eslint) linters.push('ESLint');
  if (deps.prettier) linters.push('Prettier');
  if (deps.biome) linters.push('Biome');
  if (deps.typescript || deps['ts-node'] || deps.tsx) linters.push('TypeScript');

  const framework = deps.next ? 'Next.js' :
                    deps.nuxt ? 'Nuxt' :
                    deps.svelte ? 'Svelte' :
                    deps.react ? 'React' :
                    deps.vue ? 'Vue' :
                    deps.fastify ? 'Fastify' :
                    deps.express ? 'Express' : null;

  return {
    lang: 'Node.js',
    framework,
    commands,
    linters,
    isESM: pkg.type === 'module',
    name: pkg.name,
    description: pkg.description,
  };
}

function detectPython(dir) {
  const pyproject = readTOML(join(dir, 'pyproject.toml'));
  const setupPy = readText(join(dir, 'setup.py'));
  const requirements = readText(join(dir, 'requirements.txt'));

  if (!pyproject && !setupPy && !requirements) return null;

  const commands = {};
  const linters = [];

  if (existsSync(join(dir, 'uv.lock'))) {
    commands.install = 'uv sync';
  } else if (existsSync(join(dir, 'Pipfile'))) {
    commands.install = 'pipenv install';
  } else if (existsSync(join(dir, 'poetry.lock'))) {
    commands.install = 'poetry install';
  } else if (requirements) {
    commands.install = 'pip install -r requirements.txt';
  }

  const uvRun = existsSync(join(dir, 'uv.lock')) ? 'uv run ' : '';

  if (pyproject) {
    if (pyproject.includes('[tool.ruff]') || pyproject.includes('[tool.ruff.')) linters.push('Ruff');
    if (pyproject.includes('[tool.black]')) linters.push('Black');
    if (pyproject.includes('[tool.isort]')) linters.push('isort');
    if (pyproject.includes('[tool.mypy]') || pyproject.includes('mypy')) linters.push('mypy');
    if (pyproject.includes('[tool.pytest') || pyproject.includes('pytest')) commands.test = `${uvRun}pytest`;
  }

  if (existsSync(join(dir, '.flake8')) || readText(join(dir, 'setup.cfg'))?.includes('[flake8]')) linters.push('flake8');
  if (!commands.test && (existsSync(join(dir, 'pytest.ini')) || existsSync(join(dir, 'tests')))) {
    commands.test = `${uvRun}pytest`;
  }

  if (linters.includes('Ruff')) {
    commands.lint = `${uvRun}ruff check .`;
    commands.format = `${uvRun}ruff format .`;
  } else if (linters.includes('Black')) {
    commands.format = 'black .';
  }

  return {
    lang: 'Python',
    commands,
    linters,
    name: pyproject ? (tomlGet(pyproject, 'name') || null) : null,
    description: pyproject ? (tomlGet(pyproject, 'description') || null) : null,
  };
}

function detectRust(dir) {
  const cargoToml = readTOML(join(dir, 'Cargo.toml'));
  if (!cargoToml) return null;

  const isWorkspace = cargoToml.includes('[workspace]');
  const commands = {
    build: isWorkspace ? 'cargo build --workspace' : 'cargo build',
    test: isWorkspace ? 'cargo test --workspace' : 'cargo test',
    lint: 'cargo clippy',
    format: 'cargo fmt',
  };

  return {
    lang: 'Rust',
    commands,
    linters: ['Clippy', 'rustfmt'],
    name: tomlGet(cargoToml, 'name'),
    description: tomlGet(cargoToml, 'description'),
  };
}

function detectGo(dir) {
  const goMod = readText(join(dir, 'go.mod'));
  if (!goMod) return null;

  const moduleMatch = goMod.match(/^module\s+(\S+)/m);
  const hasGolangciConfig = existsSync(join(dir, '.golangci.yml')) ||
                            existsSync(join(dir, '.golangci.yaml')) ||
                            existsSync(join(dir, '.golangci.json'));

  const commands = {
    build: 'go build ./...',
    test: 'go test ./...',
    format: 'gofmt -w .',
  };
  if (hasGolangciConfig) commands.lint = 'golangci-lint run';

  return {
    lang: 'Go',
    commands,
    linters: ['gofmt', ...(hasGolangciConfig ? ['golangci-lint'] : [])],
    module: moduleMatch ? moduleMatch[1] : null,
  };
}

function detectRuby(dir) {
  const gemfile = readText(join(dir, 'Gemfile'));
  if (!gemfile) return null;

  const commands = { install: 'bundle install' };
  const linters = [];

  if (gemfile.includes('rubocop')) {
    linters.push('RuboCop');
    commands.lint = 'bundle exec rubocop';
  }
  if (gemfile.includes('rspec')) {
    commands.test = 'bundle exec rspec';
  } else if (existsSync(join(dir, 'test'))) {
    commands.test = 'bundle exec rake test';
  }

  return {
    lang: 'Ruby',
    framework: (gemfile.includes("'rails'") || gemfile.includes('"rails"')) ? 'Rails' : null,
    commands,
    linters,
  };
}

function detectJava(dir) {
  const hasMaven = existsSync(join(dir, 'pom.xml'));
  const hasGradle = existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'));
  if (!hasMaven && !hasGradle) return null;

  return {
    lang: 'Java/Kotlin',
    buildTool: hasMaven ? 'Maven' : 'Gradle',
    commands: hasMaven
      ? { build: 'mvn compile', test: 'mvn test', package: 'mvn package' }
      : { build: './gradlew build', test: './gradlew test' },
    linters: [],
  };
}

function detectPhp(dir) {
  const composer = readJSON(join(dir, 'composer.json'));
  if (!composer) return null;

  const commands = { install: 'composer install' };
  const deps = { ...composer.require, ...composer['require-dev'] };
  if (deps['phpunit/phpunit']) commands.test = './vendor/bin/phpunit';
  if (deps['friendsofphp/php-cs-fixer']) commands.format = './vendor/bin/php-cs-fixer fix';

  return { lang: 'PHP', commands, linters: [] };
}

const detectors = [detectNode, detectPython, detectRust, detectGo, detectRuby, detectJava, detectPhp];

function detectAll(dir) {
  return detectors.map(d => d(dir)).filter(Boolean);
}

function commandsBlock(commands) {
  const entries = Object.entries(commands);
  if (!entries.length) return '';
  return entries.map(([k, v]) => `- **${k}**: \`${v}\``).join('\n');
}

function generateAgentsMd(results, dir) {
  const lines = [];

  lines.push('# AGENTS.md');
  lines.push('');
  lines.push('Instructions for AI coding agents working in this repository.');
  lines.push('');

  if (results.length === 0) {
    lines.push('No recognized project files found. Fill in the sections below manually.');
    lines.push('');
    lines.push('## Setup');
    lines.push('');
    lines.push('## Commands');
    lines.push('');
    lines.push('## Code style');
    lines.push('');
    return lines.join('\n');
  }

  const primary = results[0];
  const nodeResult = results.find(r => r.lang === 'Node.js');

  lines.push('## Setup');
  lines.push('');
  if (primary.commands?.install) {
    lines.push(`\`\`\`\n${primary.commands.install}\n\`\`\``);
  } else {
    lines.push('_No install step detected._');
  }
  lines.push('');

  lines.push('## Commands');
  lines.push('');
  for (const result of results) {
    if (results.length > 1) lines.push(`### ${result.lang}`);
    const cmds = { ...result.commands };
    delete cmds.install;
    const block = commandsBlock(cmds);
    if (block) lines.push(block);
    if (results.length > 1) lines.push('');
  }
  lines.push('');

  if (nodeResult?.commands?.test) {
    lines.push('> To run a single test file, pass the path directly to the test runner rather than going through `npm run test`.');
    lines.push('');
  }

  lines.push('## Code style');
  lines.push('');
  for (const result of results) {
    if (result.linters?.length) {
      if (results.length > 1) {
        lines.push(`**${result.lang}**: ${result.linters.join(', ')}`);
      } else {
        lines.push(`Linters / formatters in use: ${result.linters.join(', ')}`);
      }
    }
  }
  if (nodeResult?.isESM) {
    lines.push('');
    lines.push('This package uses ES modules (`"type": "module"` in package.json). Use `.js` extensions in imports and `import`/`export` syntax throughout.');
  }
  lines.push('');

  lines.push('## Architecture');
  lines.push('');

  const frameworks = results.map(r => r.framework).filter(Boolean);
  if (frameworks.length) {
    lines.push(`Framework: ${frameworks.join(', ')}`);
    lines.push('');
  }

  const descriptions = results.map(r => r.description).filter(Boolean);
  if (descriptions.length) {
    lines.push(descriptions[0]);
    lines.push('');
  }

  let srcDirs = [];
  try {
    srcDirs = readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') &&
        !['node_modules', 'vendor', 'target', 'dist', 'build', '__pycache__', '.git'].includes(e.name))
      .map(e => e.name);
  } catch { /* ignore */ }

  if (srcDirs.length) {
    lines.push('Key directories:');
    lines.push('');
    srcDirs.forEach(d => lines.push(`- \`${d}/\``));
    lines.push('');
  }

  lines.push('_Fill in component boundaries, data flow, and any non-obvious constraints here._');
  lines.push('');

  lines.push('## Conventions');
  lines.push('');
  lines.push('_Add project-specific conventions: naming, file organisation, commit format, etc._');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--version')) { console.log(VERSION); process.exit(0); }
  if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }

  let targetDir = '.';
  let outputFile = 'AGENTS.md';
  let toStdout = false;
  let overwrite = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--output') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        console.error('--output requires a filename.');
        process.exit(1);
      }
      outputFile = args[++i];
    } else if (a.startsWith('--output=')) {
      outputFile = a.slice('--output='.length);
      if (!outputFile) { console.error('--output= requires a filename.'); process.exit(1); }
    } else if (a === '--stdout') { toStdout = true; }
    else if (a === '--overwrite') { overwrite = true; }
    else if (!a.startsWith('--')) { targetDir = a; }
    else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }

  const dir = resolve(targetDir);
  const results = detectAll(dir);
  const output = generateAgentsMd(results, dir);

  if (toStdout) {
    process.stdout.write(output);
    return;
  }

  const dest = resolve(dir, outputFile);
  if (existsSync(dest) && !overwrite) {
    console.error(`${outputFile} already exists. Use --overwrite to replace it.`);
    process.exit(1);
  }

  writeFileSync(dest, output, 'utf8');
  console.log(`Wrote ${dest}`);

  if (results.length) {
    console.log(`Detected: ${results.map(r => r.lang).join(', ')}`);
  } else {
    console.log('No project files recognised - generated a blank template.');
  }
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
