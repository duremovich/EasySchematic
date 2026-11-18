/**
 * Process-level tests for the real `index.js` entry point: what happens to a
 * second / third instance when its MCP client (stdin) goes away, and that a
 * takeover prints the pairing token (#434 review B1/B2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";

const INDEX = fileURLToPath(new URL("./index.js", import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

interface Child {
  proc: ChildProcessWithoutNullStreams;
  stderr: () => string;
  exited: Promise<number | null>;
}

function launch(port: number, token?: string): Child {
  const env: NodeJS.ProcessEnv = { ...process.env, EASYSCHEMATIC_MCP_PORT: String(port) };
  delete env.EASYSCHEMATIC_MCP_TOKEN;
  // Inherited from `node --test`; it would make the child behave as a test worker.
  delete env.NODE_TEST_CONTEXT;
  if (token) env.EASYSCHEMATIC_MCP_TOKEN = token;
  const proc = spawn(process.execPath, [INDEX], { env, stdio: ["pipe", "pipe", "pipe"] });
  let err = "";
  proc.stderr.on("data", (d) => (err += d.toString()));
  proc.stdout.resume();
  const exited = new Promise<number | null>((r) => proc.once("exit", (code) => r(code)));
  return { proc, stderr: () => err, exited };
}

// Generous: a cold start (MCP SDK import over a junctioned node_modules) can be slow.
async function waitForLog(c: Child, re: RegExp, timeoutMs = 20000): Promise<RegExpMatchArray> {
  const start = Date.now();
  for (;;) {
    const m = c.stderr().match(re);
    if (m) return m;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${re} in:\n${c.stderr()}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function exitsWithin(c: Child, ms: number): Promise<number | null> {
  return Promise.race([
    c.exited,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`process did not exit within ${ms} ms:\n${c.stderr()}`)), ms)),
  ]);
}

test("index: a relaying (peer) instance exits when its client's stdin closes; the owner exits the same way", async () => {
  const port = await freePort();
  // Launch one at a time so A deterministically owns the port.
  const a = launch(port, "shared-token-1");
  let b: Child | null = null;
  try {
    await waitForLog(a, /WebSocket bridge listening on/);
    b = launch(port, "shared-token-1");
    await waitForLog(b, /already held by another EasySchematic MCP server instance/);
    assert.doesNotMatch(b.stderr(), /WebSocket bridge listening on/);

    b.proc.stdin.end();
    assert.equal(await exitsWithin(b, 5000), 0);
    assert.equal(a.proc.exitCode, null); // the owner is unaffected

    a.proc.stdin.end();
    assert.equal(await exitsWithin(a, 5000), 0);
  } finally {
    a.proc.kill();
    b?.proc.kill();
  }
});

test("index: an unavailable instance exits on stdin close; a takeover prints the new owner's pairing token", async () => {
  const port = await freePort();
  // Default config: no fixed token, so each instance makes its own random one.
  const a = launch(port);
  let b: Child | null = null;
  let c: Child | null = null;
  try {
    const tokenA = (await waitForLog(a, /Pairing token: ([0-9a-f]+)/))[1];
    b = launch(port);
    c = launch(port);
    await waitForLog(b, /NOT listening — port \d+ on 127\.0\.0\.1 is held by another process: .*different pairing token/);
    await waitForLog(c, /NOT listening/);

    // C's client goes away while C is unavailable (retry timer pending) → it exits.
    c.proc.stdin.end();
    assert.equal(await exitsWithin(c, 5000), 0);

    // A's client goes away → A exits → B takes the port and prints ITS token.
    a.proc.stdin.end();
    assert.equal(await exitsWithin(a, 5000), 0);
    // B was unavailable, so it never printed a token before — this one is the takeover's.
    const tokenB = (await waitForLog(b, /Pairing token: ([0-9a-f]+)/, 10000))[1];
    assert.match(b.stderr(), /Port \d+ is free again — this instance now hosts the bridge/);
    assert.match(b.stderr(), /took over the port/);
    assert.notEqual(tokenB, tokenA);

    b.proc.stdin.end();
    assert.equal(await exitsWithin(b, 5000), 0);
  } finally {
    a.proc.kill();
    b?.proc.kill();
    c?.proc.kill();
  }
});
