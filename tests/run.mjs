import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createFixtureServer } from './fixture-server.mjs';
import { webControlSocketPath } from '../src/runtime.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'rumiai-web-control-test-'));
const home = path.join(work, 'home');
const captureDir = path.join(work, 'capture');
const fixture = await createFixtureServer();

const env = {
  ...process.env,
  WEB_CONTROL_HOME: home,
  WEB_CONTROL_HEADLESS: process.env.WEB_CONTROL_TEST_HEADLESS ?? '1',
  WEB_CONTROL_CONNECT_TIMEOUT_MS: '15000'
};
const socketPath = webControlSocketPath(env);

async function cli(...args) {
  const { stdout } = await execFileAsync(path.join(root, 'bin', 'web-control'), args, { cwd: root, env });
  return JSON.parse(stdout);
}

async function startService() {
  const child = spawn(path.join(root, 'bin', 'web-control-service'), [], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.once('exit', code => {
    if (code && stderr) process.stderr.write(stderr);
  });
  return child;
}

async function stopService(child) {
  child.kill('SIGTERM');
  await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
}

async function waitForText(page, pattern) {
  for (let i = 0; i < 80; i += 1) {
    const result = await cli('page', 'inspect', page, 'text');
    if (pattern.test(result.text)) return result.text;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`text did not match ${pattern}`);
}

let service;
try {
  service = await startService();
  const status = await cli('status');
  assert.equal(status.profile, 'default');
  assert.equal(status.headless, env.WEB_CONTROL_HEADLESS === '1');

  const page = await cli('page', 'new');
  await cli('page', 'navigate', page.id, fixture.baseUrl);
  await waitForText(page.id, /dynamic-ready/);

  await cli('page', 'fill', page.id, '#name', 'rumiai');
  assert.match((await cli('page', 'inspect', page.id, 'text')).text, /rumiai/);

  const before = await cli('page', 'list');
  await cli('page', 'click', page.id, '#popup-button');
  for (let i = 0; i < 40; i += 1) {
    const after = await cli('page', 'list');
    if (after.length === before.length + 1 && after.some(item => item.url.endsWith('/popup'))) break;
    if (i === 39) throw new Error('popup page was not registered');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const capture = await cli('page', 'capture', page.id, captureDir, 'html', 'text', 'screenshot', 'mhtml');
  for (const filename of Object.values(capture.files)) {
    const stat = await fs.stat(filename);
    assert.ok(stat.size > 0, `empty capture file: ${filename}`);
  }
  assert.match(await fs.readFile(capture.files.html, 'utf8'), /dynamic-ready/);
  assert.match(await fs.readFile(capture.files.mhtml, 'utf8'), /multipart\/related/i);

  const cdp = await cli('debug', 'cdp', page.id, 'Runtime.evaluate', JSON.stringify({
    expression: "document.querySelector('#dynamic').textContent",
    returnByValue: true
  }));
  assert.equal(cdp.result.value, 'dynamic-ready');

  await cli('page', 'navigate', page.id, `${fixture.baseUrl}/login`);
  await cli('page', 'click', page.id, '#login');
  await waitForText(page.id, /cookie=active storage=active/);

  await stopService(service);
  service = null;

  service = await startService();
  const page2 = await cli('page', 'new');
  await cli('page', 'navigate', page2.id, `${fixture.baseUrl}/account`);
  assert.match(await waitForText(page2.id, /cookie=active storage=active/), /cookie=active storage=active/);
  const storage = await cli('page', 'inspect', page2.id, 'storage');
  assert.equal(storage.local.poc_session, 'active');
  assert.ok(storage.cookies.some(cookie => cookie.name === 'poc_session' && cookie.value === 'active'));

  await stopService(service);
  service = null;

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: [
      'immediate client readiness after service spawn',
      'public command/status',
      'dynamic rendered DOM',
      'deterministic fill/click',
      'popup page registration',
      'HTML/text/PNG/MHTML capture',
      'page-scoped CDP',
      'cookie/localStorage persistence across service restart'
    ]
  }, null, 2)}\n`);
} finally {
  if (service) service.kill('SIGTERM');
  await fixture.close();
}
