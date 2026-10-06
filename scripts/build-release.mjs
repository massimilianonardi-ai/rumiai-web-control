import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

const dist = path.join(root, 'dist');
const stageRoot = path.join(dist, 'stage');
const productRoot = path.join(stageRoot, 'rumiai-web-control');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(productRoot, { recursive: true });

for (const entry of ['README.md', 'package.json', 'bin', 'src', 'node_modules']) {
  await fs.cp(path.join(root, entry), path.join(productRoot, entry), {
    recursive: true,
    preserveTimestamps: true
  });
}

const artifactName = `rumiai-web-control-v${packageJson.version}-all.tar.gz`;
const artifact = path.join(dist, artifactName);

await new Promise((resolve, reject) => {
  const child = spawn('tar', ['-czf', artifact, '-C', stageRoot, 'rumiai-web-control'], {
    stdio: 'inherit'
  });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)));
});

await fs.writeFile(path.join(dist, 'release-artifact'), `${artifactName}\n`, 'utf8');
process.stdout.write(`${artifact}\n`);
