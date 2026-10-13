import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const violations: string[] = [];
const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (config.error || parsed.errors.length) throw new Error('Cannot validate the TypeScript configuration');
if (parsed.options.strict !== true || parsed.options.noEmit !== true || parsed.options.allowJs)
  violations.push('tsconfig.json: strict, noEmit and TypeScript-only source are required');
const checkedFiles = new Set(parsed.fileNames.map(path => resolve(path)));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

async function inspect(directory: string): Promise<void> {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(path); continue; }
    const name = relative(root, path);
    if (/\.(?:m?js|cjs|jsx)$/.test(name)) violations.push(`${name}: migrate executable JavaScript to TypeScript`);
    if (!name.endsWith('.ts')) continue;
    if (!checkedFiles.has(resolve(path))) violations.push(`${name}: file is excluded from TypeScript checking`);
    const source = await readFile(path, 'utf8');
    const file = program.getSourceFile(path) ?? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    const report = (node: ts.Node, message: string) => {
      const {line} = file.getLineAndCharacterOfPosition(node.getStart(file));
      violations.push(`${name}:${line + 1}: ${message}`);
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)
        && (checker.getTypeAtLocation(node.name).flags & ts.TypeFlags.Any))
        report(node, 'declarations must not inherit an untyped value from a library or parser');
      if (node.kind === ts.SyntaxKind.AnyKeyword) report(node, 'explicit dynamic types are not allowed');
      if (ts.isAsExpression(node) && ts.isAsExpression(node.expression) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword)
        report(node, 'do not erase types through a double assertion');
      ts.forEachChild(node, visit);
    };
    visit(file);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if ((token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia)
        && /@ts-(?:ignore|nocheck|expect-error)/.test(scanner.getTokenText())) {
        violations.push(`${name}: TypeScript error suppression is not allowed`);
      }
    }
  }
}
for (const directory of ['src', 'tests', 'scripts']) await inspect(join(root, directory));
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log('Type policy passed: all source, tests and tools are TypeScript with no suppressed errors.');
