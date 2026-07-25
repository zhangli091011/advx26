import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin } from "../src/lib/api";

function request(url: string, origin?: string, fetchSite?: string) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (fetchSite) headers.set("sec-fetch-site", fetchSite);
  return new Request(url, { headers });
}

test("accepts exact same-origin requests", () => {
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api", "http://127.0.0.1:41234", "same-origin")), true);
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api", "http://127.0.0.1:41234", "cross-site")), true);
});

test("accepts localhost aliases only on the same protocol and port", () => {
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api", "http://localhost:41234", "cross-site")), true);
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api", "http://localhost:41235", "cross-site")), false);
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api", "https://localhost:41234", "cross-site")), false);
});

test("rejects external origins and ambiguous non-browser requests", () => {
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api", "https://example.com", "cross-site")), false);
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api")), false);
  assert.equal(isSameOrigin(request("http://127.0.0.1:41234/api", undefined, "same-origin")), true);
});

test("uses the browser-visible Host header when the server binds to 0.0.0.0", () => {
  assert.equal(isSameOrigin(new Request("http://0.0.0.0:3001/api/pit/config", {
    headers: {
      host: "localhost:3001",
      origin: "http://localhost:3001",
    },
  })), true);
});
