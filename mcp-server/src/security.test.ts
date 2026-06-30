import { test } from "node:test";
import assert from "node:assert/strict";
import { isOriginAllowed, tokensMatch } from "./security.js";

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
