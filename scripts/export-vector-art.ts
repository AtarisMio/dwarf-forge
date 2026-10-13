import { mkdir, writeFile } from 'node:fs/promises';
import { WORKSHOP_ART, calendarArt, ledgerArt } from '../src/workshop-vector-art.ts';
import { svgDocument } from '../src/vector-panels.ts';

const directory = new URL('../public/art/vector/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, art] of Object.entries({ ...WORKSHOP_ART, calendar: calendarArt(1), ledger: ledgerArt() })) {
  await writeFile(new URL(`${name}.svg`, directory), svgDocument(art.width, art.height, art.body));
}
console.log('Exported 11 editable SVG originals to public/art/vector.');
