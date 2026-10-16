import assert from "node:assert/strict";
import test from "node:test";

import { parseRegisterEvent } from "../src/app/register/register-event.ts";

test("register SSE accepts canonical envelope", () => {
  const config = parseRegisterEvent('{"register":{"target":"openai","mail":{"providers":[]}}}');
  assert.equal(config?.target, "openai");
});

test("register SSE rejects bare config and error snapshot", () => {
  assert.equal(parseRegisterEvent('{"target":"openai"}'), null);
  assert.equal(parseRegisterEvent('{"register":{"error":"sidecar unavailable"}}'), null);
  assert.equal(parseRegisterEvent("{"), null);
});
