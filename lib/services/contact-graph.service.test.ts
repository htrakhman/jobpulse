import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleSearchUrl,
  isLikelyCompanyDomain,
  normalizeName,
} from "./contact-graph.utils.ts";

test("normalizeName strips punctuation and spaces", () => {
  assert.equal(normalizeName("  Jane   Doe, PhD "), "jane doe phd");
});

test("isLikelyCompanyDomain detects matching root token", () => {
  assert.equal(isLikelyCompanyDomain("vertice.com", "Vertice"), true);
  assert.equal(isLikelyCompanyDomain("gmail.com", "Vertice"), false);
});

test("buildGoogleSearchUrl generates query URL", () => {
  const url = buildGoogleSearchUrl("Jane Doe", "Vertice", "jane@vertice.com");
  assert.ok(url?.startsWith("https://www.google.com/search?q="));
  assert.ok(url?.includes("Jane%20Doe"));
});

