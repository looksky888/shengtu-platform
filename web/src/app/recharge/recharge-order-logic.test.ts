import assert from "node:assert/strict";
import test from "node:test";

import type * as PaymentStatusMod from "../../lib/payment-order-status";
import type * as OrderLogicMod from "./recharge-order-logic";

async function loadModules(): Promise<{
  statusMod: typeof PaymentStatusMod;
  logicMod: typeof OrderLogicMod;
}> {
  const [statusMod, logicMod] = await Promise.all([
    import(
      new URL("../../lib/payment-order-status.ts", import.meta.url).href
    ) as Promise<typeof PaymentStatusMod>,
    import(
      new URL("./recharge-order-logic.ts", import.meta.url).href
    ) as Promise<typeof OrderLogicMod>,
  ]);
  return { statusMod, logicMod };
}

test("exception orders are always escapable while still allowing status refresh", async () => {
  const { statusMod, logicMod } = await loadModules();

  assert.equal(statusMod.isEscapablePaymentOrderStatus("exception"), true);
  assert.equal(statusMod.paymentOrderStatusLabel("expired"), "已过期");

  const exceptionActions = logicMod.resolveRechargeOrderActionState(
    { status: "exception" },
    false,
  );
  assert.equal(exceptionActions.escapable, true);
  assert.equal(exceptionActions.showReset, true);
  assert.equal(exceptionActions.resetLabel, "返回重选套餐");
  assert.equal(exceptionActions.showRefresh, true);
});

test("client countdown expiry on pending order exposes both sync and cancel-reset actions", async () => {
  const { logicMod } = await loadModules();

  const expiredPending = logicMod.resolveRechargeOrderActionState(
    { status: "pending" },
    true,
  );
  assert.equal(expiredPending.expiredPending, true);
  assert.equal(expiredPending.showRefresh, true);
  assert.equal(expiredPending.refreshLabel, "我已支付，立即同步");
  assert.equal(expiredPending.cancellable, true);
  assert.equal(expiredPending.cancelLabel, "取消并重选套餐");
});

test("validateCustomCreditsDraft supports empty draft without zero-snapping and enforces bounds", async () => {
  const { logicMod } = await loadModules();

  const empty = logicMod.validateCustomCreditsDraft("", 100, 5000, 10);
  assert.equal(empty.valid, false);
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.numericValue, null);
  assert.equal(empty.amountFen, 0);

  const tooLow = logicMod.validateCustomCreditsDraft("50", 100, 5000, 10);
  assert.equal(tooLow.valid, false);
  assert.equal(tooLow.numericValue, 50);
  assert.match(tooLow.errorMessage, /最少充值 100/);

  const tooHigh = logicMod.validateCustomCreditsDraft("6000", 100, 5000, 10);
  assert.equal(tooHigh.valid, false);
  assert.match(tooHigh.errorMessage, /最多充值 5000/);

  const valid = logicMod.validateCustomCreditsDraft("250", 100, 5000, 10);
  assert.equal(valid.valid, true);
  assert.equal(valid.numericValue, 250);
  assert.equal(valid.amountFen, 2500);
});

test("computeProductValueMetrics calculates unit value, savings badge, and image capacity", async () => {
  const { logicMod } = await loadModules();

  const products = [
    {
      id: "p1",
      sku: "c100",
      name: "入门包",
      amount_fen: 1000,
      credits: 100,
      product_type: "credits",
    },
    {
      id: "p2",
      sku: "c500",
      name: "进阶包",
      amount_fen: 4000,
      credits: 500,
      product_type: "credits",
    },
    {
      id: "p3",
      sku: "c2000",
      name: "旗舰包",
      amount_fen: 14000,
      credits: 2000,
      product_type: "credits",
    },
  ];

  const recommendedId = logicMod.pickRecommendedProductId(products);
  assert.equal(recommendedId, "p2");

  const metrics = logicMod.computeProductValueMetrics(
    products[1]!,
    10,
    recommendedId,
  );
  assert.equal(metrics.isRecommended, true);
  assert.equal(metrics.unitRateLabel, "折合 ¥8.00 / 百积分");
  assert.equal(metrics.savingsPercent, 20);
  assert.equal(metrics.capacityHint, "约可生图 100 张");

  assert.equal(
    logicMod.isExternalHttpPaymentUrl("https://qr.alipay.com/bax0123"),
    true,
  );
  assert.equal(
    logicMod.isExternalHttpPaymentUrl("weixin://wxpay/bizpayurl?pr=1"),
    false,
  );
});
