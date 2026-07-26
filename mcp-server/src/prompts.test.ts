import { test } from "node:test";
import assert from "node:assert/strict";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { PROMPTS, getPrompt, SERVER_INSTRUCTIONS } from "./prompts.js";

test("PROMPTS: exposes the three named playbooks", () => {
  assert.deepEqual(
    PROMPTS.map((p) => p.name).sort(),
    ["build-schematic", "modular-chassis", "rack-elevation"],
  );
  // Every prompt the list advertises must be resolvable by getPrompt.
  for (const p of PROMPTS) {
    assert.ok(getPrompt(p.name).messages.length > 0);
  }
});

test("getPrompt: a supplied argument is woven into the message", () => {
  const result = getPrompt("build-schematic", { brief: "huddle room with one display" });
  const text = result.messages[0].content.type === "text" ? result.messages[0].content.text : "";
  assert.match(text, /get_schematic/); // the playbook body is present
  assert.match(text, /huddle room with one display/); // the user's brief is appended
});

test("getPrompt: missing argument falls back to a guiding instruction", () => {
  const text = getPrompt("modular-chassis").messages[0].content;
  assert.equal(text.type, "text");
  if (text.type === "text") assert.match(text.text, /ask the user which one to configure/);
});

test("getPrompt: an unknown name throws an MCP InvalidParams error", () => {
  assert.throws(
    () => getPrompt("no-such-prompt"),
    (err) => err instanceof McpError && err.code === ErrorCode.InvalidParams,
  );
});

test("SERVER_INSTRUCTIONS: names the three playbooks", () => {
  for (const name of ["build-schematic", "rack-elevation", "modular-chassis"]) {
    assert.ok(SERVER_INSTRUCTIONS.includes(name));
  }
});
