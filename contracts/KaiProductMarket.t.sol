// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaiProductMarket} from "./KaiProductMarket.sol";

contract KaiProductMarketTest is Test {
    KaiProductMarket market;
    address payable treasury = payable(makeAddr("treasury"));
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address seller = makeAddr("seller");
    uint256 constant INITIAL_FEE = 0.001 ether;

    function setUp() public {
        market = new KaiProductMarket(treasury, INITIAL_FEE);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(seller, 10 ether);
    }

    function test_RegisterProduct() public {
        market.registerProduct("honey", "Forest Honey Reserve", "GAMI", 10e18, treasury);
        assertEq(market.getRegisteredProductsCount(), 1);

        (
            string memory id,
            string memory name,
            string memory tokenSymbol,
            string memory category,
            uint256 price,
            address sellerAddr,
            uint256 stock,
            bool active,
            uint256 totalSold
        ) = market.products("honey");

        assertEq(id, "honey");
        assertEq(name, "Forest Honey Reserve");
        assertEq(tokenSymbol, "GAMI");
        assertEq(category, "General");
        assertEq(price, 10e18);
        assertEq(sellerAddr, treasury);
        assertEq(stock, 1_000_000);
        assertTrue(active);
        assertEq(totalSold, 0);
    }

    function test_RegisterProductFullBySeller() public {
        vm.startPrank(seller);
        market.registerProductFull(
            "seedling-batch-101",
            "Markhamia Lutea Seedlings",
            "NVR",
            "Tree Nursery",
            0.05 ether,
            500,
            seller
        );
        vm.stopPrank();

        assertEq(market.getRegisteredProductsCount(), 1);
        string[] memory sellerProducts = market.getProductsBySeller(seller);
        assertEq(sellerProducts.length, 1);
        assertEq(sellerProducts[0], "seedling-batch-101");
    }

    function test_UpdateProduct() public {
        vm.startPrank(seller);
        market.registerProductFull(
            "seedling-batch-101",
            "Markhamia Lutea Seedlings",
            "NVR",
            "Tree Nursery",
            0.05 ether,
            500,
            seller
        );

        market.updateProduct("seedling-batch-101", 0.06 ether, 450, true);
        vm.stopPrank();

        (, , , , uint256 price, , uint256 stock, , ) = market.products("seedling-batch-101");
        assertEq(price, 0.06 ether);
        assertEq(stock, 450);
    }

    function test_BuyProductWithFee() public {
        market.registerProduct("honey", "Forest Honey Reserve", "GAMI", 0, treasury);

        uint256 treasuryBefore = treasury.balance;
        vm.startPrank(alice);
        bytes32 orderId = market.buyProduct{value: INITIAL_FEE}("honey", "GAMI", 2, 20e18);
        vm.stopPrank();

        assertTrue(orderId != bytes32(0));
        assertEq(treasury.balance, treasuryBefore + INITIAL_FEE);
        assertEq(market.totalProductVolume("honey"), 2);
        assertEq(market.totalPurchasesCount(), 1);

        bytes32[] memory aliceOrders = market.getBuyerOrders(alice);
        assertEq(aliceOrders.length, 1);
        assertEq(aliceOrders[0], orderId);
    }

    function test_BuyProductNativePaymentAndFulfillmentLifecycle() public {
        // Seller registers product costing 0.1 ETH, stock 10
        vm.prank(seller);
        market.registerProductFull("bamboo-batch", "Bamboo Saplings", "NVR", "Nursery", 0.1 ether, 10, seller);

        uint256 totalCost = 0.2 ether; // 2 units @ 0.1 ether
        uint256 totalValueSent = totalCost + INITIAL_FEE;
        uint256 treasuryBefore = treasury.balance;
        uint256 sellerBefore = seller.balance;

        // Alice buys 2 units
        vm.prank(alice);
        bytes32 orderId = market.buyProduct{value: totalValueSent}("bamboo-batch", 2);

        // Check fee forwarded to treasury & stock reduced
        assertEq(treasury.balance, treasuryBefore + INITIAL_FEE);
        (, , , , , , uint256 stockRemaining, , uint256 totalSold) = market.products("bamboo-batch");
        assertEq(stockRemaining, 8);
        assertEq(totalSold, 2);

        // Seller dispatches
        vm.prank(seller);
        market.dispatchOrder(orderId);

        // Deliver order
        vm.prank(seller);
        market.deliverOrder(orderId);

        // Confirm & release payment to seller
        vm.prank(alice);
        market.confirmAndReleasePayment(orderId);

        assertEq(seller.balance, sellerBefore + totalCost);
    }

    function test_CancelAndRefundOrder() public {
        vm.prank(seller);
        market.registerProductFull("mango-graft", "Mango Grafted Sapling", "NVR", "Nursery", 0.2 ether, 5, seller);

        uint256 totalCost = 0.2 ether;
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        bytes32 orderId = market.buyProduct{value: totalCost + INITIAL_FEE}("mango-graft", 1);

        assertEq(alice.balance, aliceBefore - (totalCost + INITIAL_FEE));

        // Alice cancels order before dispatch
        vm.prank(alice);
        market.cancelAndRefundOrder(orderId);

        // Check stock restored to 5 & product cost refunded to Alice (fee stayed with protocol)
        (, , , , , , uint256 stockRemaining, , ) = market.products("mango-graft");
        assertEq(stockRemaining, 5);
        assertEq(alice.balance, aliceBefore - INITIAL_FEE);
    }

    function test_BuyProductInsufficientStockReverts() public {
        vm.prank(seller);
        market.registerProductFull("rare-tree", "Rare Indigenous Sapling", "NVR", "Nursery", 0.1 ether, 2, seller);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                KaiProductMarket.InsufficientStock.selector,
                2,
                3
            )
        );
        market.buyProduct{value: 0.3 ether + INITIAL_FEE}("rare-tree", 3);
    }

    function test_UnauthorizedSellerUpdateReverts() public {
        vm.prank(seller);
        market.registerProductFull("pine-tree", "Pine Saplings", "NVR", "Nursery", 0.05 ether, 100, seller);

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                KaiProductMarket.UnauthorizedSeller.selector,
                bob
            )
        );
        market.updateProduct("pine-tree", 0.1 ether, 100, true);
    }

    function test_BuyProductUnderpaidFeeReverts() public {
        market.registerProduct("honey", "Forest Honey Reserve", "GAMI", 0, treasury);

        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                KaiProductMarket.InsufficientFee.selector,
                INITIAL_FEE,
                0.0005 ether
            )
        );
        market.buyProduct{value: 0.0005 ether}("honey", "GAMI", 1, 10e18);
        vm.stopPrank();
    }

    function test_SetTreasuryAndFee() public {
        address payable newTreasury = payable(makeAddr("newTreasury"));
        market.setTreasury(newTreasury);
        assertEq(market.treasury(), newTreasury);

        market.setFee(0.002 ether);
        assertEq(market.fee(), 0.002 ether);
    }
}

