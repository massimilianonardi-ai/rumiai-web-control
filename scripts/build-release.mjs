import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const osarchMap = new Map([
  ['linux:x64', 'linux-x86_64'],
  ['linux:arm64', 'linux-arm64'],
  ['darwin:x64', 'macos-x86_64'],
  ['darwin:arm64', 'macos-arm64']
]);
const osarch = osarchMap.get(`${process.platform}:${process.arch}`);
if (!osarch) throw new Error(`unsupported release platform: ${process.platform}:${process.arch}`);

const localBrowsers = path.join(root, 'node_modules', 'playwright-core', '.local-browsers');
try {
  const entries = await fs.readdir(localBrowsers);
  if (!entries.length) throw new Error('empty browser directory');
} catch (error) {
  throw new Error(`Playwright hermetic browser is missing at ${localBrowsers}: ${error.message}`);
}

const dist = path.join(root, 'dist');
const stageRoot = path.join(dist, 'stage');
const productRoot = path.join(stageRoot, 'rumiai-web-control');
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(productRoot, { recursive: true });

for (const entry of ['README.md', 'package.json', 'bin', 'src', 'node_modules']) {
  await fs.cp(path.join(root, entry), path.join(productRoot, entry), { recursive: true, preserveTimestamps: true });
}

const artifactName = `rumiai-web-control-v${packageJson.version}-${osarch}.tar.gz`;
const artifact = path.join(dist, artifactName);
await new Promise((resolve, reject) => {
  const child = spawn('tar', ['-czf', artifact, '-C', stageRoot, 'rumiai-web-control'], { stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)));
});

const releaseArtifactMarker = path.join(dist, 'release-artifact');
await fs.writeFile(releaseArtifactMarker, `${artifactName}\n`, 'utf8');
process.stdout.write(`${artifact}\n`);
