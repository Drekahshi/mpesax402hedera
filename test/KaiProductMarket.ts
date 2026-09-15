import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther } from "viem";

import { network } from "hardhat";

describe("KaiProductMarket", async function () {
  const { viem } = await network.create();

  async function deployMarketFixture() {
    const [owner, treasury, seller, buyer] = await viem.getWalletClients();
    const fee = parseEther("0.001");
    const market = await viem.deployContract("KaiProductMarket", [
      treasury.account.address,
      fee,
    ]);

    return { market, owner, treasury, seller, buyer, fee };
  }

  it("registers products and tracks inventory stock", async function () {
    const { market, seller } = await deployMarketFixture();

    await market.write.registerProductFull(
      [
        "nursery-batch-001",
        "Indigenous Prunus Africana Seedlings",
        "NVR",
        "Tree Nursery",
        parseEther("0.05"),
        1000n,
        seller.account.address,
      ],
      { account: seller.account }
    );

    const count = await market.read.getRegisteredProductsCount();
    assert.equal(count, 1n);

    const product = await market.read.products(["nursery-batch-001"]);
    assert.equal(product[0], "nursery-batch-001");
    assert.equal(product[1], "Indigenous Prunus Africana Seedlings");
    assert.equal(product[3], "Tree Nursery");
    assert.equal(product[4], parseEther("0.05"));
    assert.equal(product[5].toLowerCase(), seller.account.address.toLowerCase());
    assert.equal(product[6], 1000n);
    assert.equal(product[7], true);
  });

  it("executes full purchase, fee forwarding, and order fulfillment lifecycle", async function () {
    const { market, seller, buyer, treasury, fee } = await deployMarketFixture();
    const unitPrice = parseEther("0.1");

    // 1. Seller registers seedling product
    await market.write.registerProductFull(
      [
        "bamboo-batch-500",
        "Giant Bamboo Seedling Batch",
        "NVR",
        "Tree Nursery",
        unitPrice,
        500n,
        seller.account.address,
      ],
      { account: seller.account }
    );

    // 2. Buyer purchases 5 units
    const quantity = 5n;
    const totalCost = unitPrice * quantity; // 0.5 ETH
    const totalPayment = totalCost + fee; // 0.501 ETH

    const buyTx = market.write.buyProduct(["bamboo-batch-500", quantity], {
      account: buyer.account,
      value: totalPayment,
    });

    const anyVal = () => true;

    await viem.assertions.emitWithArgs(
      buyTx,
      market,
      "ProductPurchased",
      [
        anyVal,
        buyer.account.address,
        seller.account.address,
        "bamboo-batch-500",
        "NVR",
        quantity,
        totalCost,
        fee,
        anyVal,
      ]
    );

    // Check inventory reduced to 495
    const productAfter = await market.read.products(["bamboo-batch-500"]);
    assert.equal(productAfter[6], 495n);
    assert.equal(productAfter[8], 5n); // totalSold

    // Get order ID from buyer orders list
    const buyerOrders = await market.read.getBuyerOrders([buyer.account.address]);
    assert.equal(buyerOrders.length, 1);
    const orderId = buyerOrders[0];

    // 3. Seller dispatches order
    await market.write.dispatchOrder([orderId], { account: seller.account });
    let order = await market.read.orders([orderId]);
    assert.equal(order[10], 1); // OrderStatus.DISPATCHED (enum index 1)

    // 4. Seller / Buyer delivers order
    await market.write.deliverOrder([orderId], { account: seller.account });
    order = await market.read.orders([orderId]);
    assert.equal(order[10], 2); // OrderStatus.DELIVERED (enum index 2)

    // 5. Buyer confirms & releases payment to seller
    await market.write.confirmAndReleasePayment([orderId], { account: buyer.account });
    order = await market.read.orders([orderId]);
    assert.equal(order[10], 3); // OrderStatus.COMPLETED (enum index 3)
  });
});
