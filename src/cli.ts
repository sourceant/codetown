#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { diff } from './diff.js';
import { format } from './format.js';
import { parse } from './parse.js';
import { render } from './render.js';
import type { Town } from './model.js';
import { CONCEPTS } from './vocabulary.js';

const USAGE = `codetown: describe software as a city

  codetown check <file.town>                 report problems, exit 1 on errors
  codetown fmt <file.town> [--write]         print the canonical text, or rewrite the file
  codetown render <file.town> [-o out.svg] [--still] [--theme light|dark|auto]
  codetown diff <before.town> <after.town> [-o change.town]
  codetown json <file.town>                  print the parsed town as JSON
  codetown words                             print every word, its meaning and its source
`;

function read(path: string | undefined): Town {
  if (!path) fail(USAGE);
  return parse(readFileSync(path, 'utf8'));
}

function fail(message: string): never {
  process.stderr.write(message.endsWith('\n') ? message : message + '\n');
  process.exit(2);
}

function report(town: Town, path: string): boolean {
  for (const one of town.diagnostics) process.stderr.write(`${path}:${one.line}: ${one.severity}: ${one.message}\n`);
  return !town.diagnostics.some((one) => one.severity === 'error');
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function output(args: string[], text: string) {
  const to = flag(args, '-o');
  if (to) writeFileSync(to, text);
  else process.stdout.write(text);
}

const [command, ...args] = process.argv.slice(2);
const files = args.filter((one, i) => !one.startsWith('-') && !['-o', '--theme'].includes(args[i - 1] ?? ''));

switch (command) {
  case 'check': {
    const town = read(files[0]);
    process.exit(report(town, files[0]!) ? 0 : 1);
  }
  case 'fmt': {
    const town = read(files[0]);
    if (!report(town, files[0]!)) process.exit(1);
    if (args.includes('--write')) writeFileSync(files[0]!, format(town));
    else process.stdout.write(format(town));
    break;
  }
  case 'render': {
    const town = read(files[0]);
    if (!report(town, files[0]!)) process.exit(1);
    const theme = flag(args, '--theme');
    output(args, render(town, { animate: !args.includes('--still'), theme: theme === 'light' || theme === 'dark' ? theme : 'auto' }));
    break;
  }
  case 'diff': {
    const before = read(files[0]);
    const after = read(files[1]);
    if (!report(before, files[0]!) || !report(after, files[1]!)) process.exit(1);
    output(args, format(diff(before, after)));
    break;
  }
  case 'json': {
    const town = read(files[0]);
    process.stdout.write(JSON.stringify(town, null, 2) + '\n');
    break;
  }
  case 'words': {
    const rows = CONCEPTS.map((one) => {
      const source = one.source ? `${one.source.name}: ${one.source.term}` : one.candidate ? `Candidate: ${one.candidate.name}, ${one.candidate.term}` : 'None yet';
      const words = [one.keyword, ...one.aliases].map((word) => `\`${word}\``).join(', ');
      return `| ${words} | ${one.role} | ${one.means} | ${one.town} | ${source} |`;
    });
    process.stdout.write(['| Words | Written as | Means | Town | Source |', '| --- | --- | --- | --- | --- |', ...rows].join('\n') + '\n');
    break;
  }
  default:
    fail(USAGE);
}
