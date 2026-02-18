import { test } from "bun:test";
import { assertDeepEqual, assertEqual, assertOk } from "./_support/assert.ts";
import { registerTests } from "./suite.ts";

registerTests({
  test,
  assertEqual,
  assertDeepEqual,
  assertOk,
});
