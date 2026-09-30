import test from "node:test";
import assert from "node:assert/strict";
import { safeAuthReturnTo } from "../lib/security/auth-return";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("authentication can return only to known private/booking destinations", () => {
  assert.equal(safeAuthReturnTo("/personal"), "/personal");
  assert.equal(safeAuthReturnTo(`/booking/${id}`), `/booking/${id}`);
  assert.equal(
    safeAuthReturnTo(`/booking/manage/${id}`),
    `/booking/manage/${id}`,
  );
  assert.equal(
    safeAuthReturnTo(`/booking/${id}?practitioner=${id}&service=${id}`),
    `/booking/${id}?practitioner=${id}&service=${id}`,
  );
  assert.equal(
    safeAuthReturnTo(`/booking/${id}?date=2026-10-02`),
    `/booking/${id}?date=2026-10-02`,
  );
});
test("authentication return rejects external URLs, scheme tricks and unexpected parameters", () => {
  for (const value of [
    `https://evil.test`,
    "//evil.test",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/calendar",
    "/personal?source=secret",
    `/booking/${id}#token`,
    `/booking/${id}?returnTo=//evil.test`,
    `/booking/${id}?practitioner=wrong`,
    `/booking/${id}?service=${id}&service=${id}`,
    `/booking/${id}?date=2026-02-30`,
    `/booking/${id}?date=2026-10-02&date=2026-10-03`,
    `/booking/manage/${id}?date=2026-10-02`,
    null,
  ])
    assert.equal(safeAuthReturnTo(value), "");
});
