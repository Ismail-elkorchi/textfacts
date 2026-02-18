import { assertDeepEqual, assertEqual, assertOk } from "./_support/assert.ts";
import { registerTests } from "./suite.ts";

registerTests({
  test: (name, fn) => Deno.test(name, fn),
  assertEqual,
  assertDeepEqual,
  assertOk,
});
