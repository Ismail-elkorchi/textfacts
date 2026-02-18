import { test } from "node:test";
import { assertDeepEqual, assertEqual, assertOk } from "./_support/assert.ts";
import { registerTests } from "./suite.ts";

registerTests({
  test,
  assertEqual,
  assertDeepEqual,
  assertOk,
});
