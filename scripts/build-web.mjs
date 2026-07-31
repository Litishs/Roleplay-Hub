import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of ['index.html', 'character', 'assets', 'LICENSE']) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
