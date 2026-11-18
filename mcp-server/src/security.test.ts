import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyHandshake, isLoopbackAddress, isOriginAllowed, tokensMatch } from "./security.js";

test("tokensMatch: equal tokens match, others do not", () => {
  assert.equal(tokensMatch("abc123", "abc123"), true);
  assert.equal(tokensMatch("abc123", "abc124"), false);
  assert.equal(tokensMatch("abc", "abc123"), false); // length mismatch
  assert.equal(tokensMatch("", ""), false); // empty never matches
});

test("isOriginAllowed: localhost allowed by default", () => {
  assert.equal(isOriginAllowed("http://localhost:5173", []), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:4173", []), true);
});

test("isOriginAllowed: foreign origin rejected unless explicitly allowed", () => {
  assert.equal(isOriginAllowed("https://evil.example.com", []), false);
  assert.equal(isOriginAllowed("https://app.mysite.com", ["https://app.mysite.com"]), true);
});

test("isOriginAllowed: missing or malformed origin rejected", () => {
  assert.equal(isOriginAllowed(undefined, []), false);
  assert.equal(isOriginAllowed("not-a-url", []), false);
});

test("isLoopbackAddress: only loopback forms", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("127.1.2.3"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.1.10"), false);
  assert.equal(isLoopbackAddress("::ffff:10.0.0.1"), false);
  assert.equal(isLoopbackAddress(undefined), false);
  assert.equal(isLoopbackAddress(""), false);
});

test("classifyHandshake: browsers (always send Origin) can never take the peer path", () => {
  // Allowed Origin → tab path (token-checked hello), never peer.
  assert.equal(classifyHandshake("http://localhost:5173", "127.0.0.1", []), "tab");
  // Disallowed / empty / opaque Origin → rejected, never peer.
  assert.equal(classifyHandshake("https://evil.example.com", "127.0.0.1", []), "reject");
  assert.equal(classifyHandshake("", "127.0.0.1", []), "reject");
  assert.equal(classifyHandshake("null", "127.0.0.1", []), "reject");
  // No Origin → peer only from loopback.
  assert.equal(classifyHandshake(undefined, "127.0.0.1", []), "peer");
  assert.equal(classifyHandshake(undefined, "::ffff:127.0.0.1", []), "peer");
  assert.equal(classifyHandshake(undefined, "10.0.0.5", []), "reject");
  assert.equal(classifyHandshake(undefined, undefined, []), "reject");
});
