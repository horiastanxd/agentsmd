# agentsmd

CLI that generates an `AGENTS.md` for your project. It reads your existing config files — `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, and others — and produces a ready-to-fill template with detected commands, linters, and project structure.

`AGENTS.md` is the file AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, and others) read to understand how to work in a repo.

## Usage

```bash
npx @horiastanxd/agentsmd
```

Or install globally:

```bash
npm install -g @horiastanxd/agentsmd
agentsmd
```

By default it writes `AGENTS.md` in the current directory. Pass a path to run it elsewhere:

```bash
agentsmd ./my-project
```

### Options

| Flag | Description |
|------|-------------|
| `--output <file>` | Write to a different file name |
| `--stdout` | Print to stdout instead of writing |
| `--overwrite` | Overwrite an existing `AGENTS.md` |
| `--version` | Print version |
| `--help` | Print help |

## What it detects

| Ecosystem | Files read | Extracted |
|-----------|-----------|-----------|
| Node.js | `package.json`, lock files | scripts, package manager, framework, linters |
| Python | `pyproject.toml`, `requirements.txt`, `Pipfile`, `poetry.lock`, `uv.lock` | package manager, test runner, linters |
| Rust | `Cargo.toml` | build/test/lint commands, workspace flag |
| Go | `go.mod`, `.golangci.yml` | module name, build/test/lint commands |
| Ruby | `Gemfile` | bundler, rspec/rake, RuboCop |
| Java/Kotlin | `pom.xml`, `build.gradle` | Maven or Gradle commands |
| PHP | `composer.json` | composer install, PHPUnit |

For multi-language monorepos, sections for each detected ecosystem are included.

## Output example

Running `agentsmd --stdout` on a typical Next.js project:

```
# AGENTS.md

Instructions for AI coding agents working in this repository.

## Setup

    npm install

## Commands

- **build**: `npm run build`
- **dev**: `npm run dev`
- **test**: `npm run test`
- **lint**: `npm run lint`

## Code style

Linters / formatters in use: ESLint, Prettier, TypeScript

## Architecture

Framework: Next.js

_Fill in component boundaries, data flow, and any non-obvious constraints here._

## Conventions

_Add project-specific conventions: naming, file organisation, commit format, etc._
```

## Why

Most repos that work with AI agents need some form of `AGENTS.md` (or `CLAUDE.md`, `.cursorrules`, etc.) to give the agent context on how to build, test, and lint the code. Writing one from scratch every time is tedious. This tool does the mechanical part — scanning configs — and leaves the judgment calls (architecture, conventions, gotchas) for you to fill in.

## Requirements

Node.js 18 or later. No runtime dependencies.

## License

MIT
