import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rechargeSourceURL = new URL("../src/app/recharge/recharge-content.tsx", import.meta.url);
const rechargeOrderHookURL = new URL("../src/app/recharge/use-recharge-order.ts", import.meta.url);
const rechargeStatusSourceURL = new URL("../src/app/recharge/recharge-order-status.tsx", import.meta.url);
const profileSourceURL = new URL("../src/app/profile/profile-content.tsx", import.meta.url);

test("recharge center renders the payment code instead of opening its target URL", async () => {
  const source = await readFile(rechargeSourceURL, "utf8");
  const orderHookSource = await readFile(rechargeOrderHookURL, "utf8");
  const statusSource = await readFile(rechargeStatusSourceURL, "utf8");
  assert.doesNotMatch(source + statusSource, /window\.open\s*\(/);
  assert.match(statusSource, /QRCode\.toDataURL\(order\.code_url/);
  assert.match(orderHookSource, /queryPaymentOrder\(item\.id\)/);
  assert.doesNotMatch(orderHookSource, /setInterval\(.*queryPaymentOrder/s);
  assert.match(statusSource, /formatPaymentCountdown/);
  assert.match(statusSource, /支付剩余时间/);
});

test("profile does not duplicate the recharge center entry", async () => {
  const source = await readFile(profileSourceURL, "utf8");
  assert.doesNotMatch(source, /ProfileRechargeCard/);
  assert.doesNotMatch(source, /在线充值/);
});
