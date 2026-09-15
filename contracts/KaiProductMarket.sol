// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KaiProductMarket
 * @notice Smart contract for registering, managing, and purchasing products, ecosystem commodities,
 *         tree nursery MRV batches, insurance units, and tokenized RWAs on Hedera / EVM.
 *         Supports seller product management, stock inventory control, native token escrow,
 *         protocol fee forwarding to treasury, and a full order fulfillment lifecycle
 *         (PLACED -> DISPATCHED -> DELIVERED -> COMPLETED / CANCELLED).
 */
contract KaiProductMarket is Ownable {
    address payable public treasury;
    uint256 public fee; // protocol fee in tinybars / wei, e.g. 100,000 tinybars (0.001 HBAR)
    uint256 public totalProtocolFeesCollected;
    uint256 public totalPurchasesCount;

    enum OrderStatus {
        PLACED,
        DISPATCHED,
        DELIVERED,
        COMPLETED,
        CANCELLED,
        DISPUTED
    }

    struct ProductItem {
        string id;
        string name;
        string tokenSymbol;
        string category;
        uint256 price; // unit price in wei / tinybars
        address seller;
        uint256 stock; // available inventory quantity
        bool active;
        uint256 totalSold;
    }

    struct PurchaseOrder {
        bytes32 orderId;
        address buyer;
        address seller;
        string productId;
        string tokenSymbol;
        uint256 quantity;
        uint256 unitPrice;
        uint256 totalPrice; // total product price held in escrow (or recorded)
        uint256 feePaid;
        uint256 timestamp;
        OrderStatus status;
        bool escrowed; // true if native funds are stored in contract escrow for seller payout
    }

    // productId => ProductItem
    mapping(string => ProductItem) public products;
    string[] public registeredProductIds;

    // seller => array of productIds
    mapping(address => string[]) private _sellerProducts;

    // orderId => PurchaseOrder
    mapping(bytes32 => PurchaseOrder) public orders;
    // buyer => list of orderIds
    mapping(address => bytes32[]) private _buyerOrders;
    // seller => list of orderIds
    mapping(address => bytes32[]) private _sellerOrders;
    // productId => total volume
    mapping(string => uint256) public totalProductVolume;

    event ProductRegistered(
        string indexed productId,
        string name,
        string tokenSymbol,
        string category,
        uint256 price,
        uint256 stock,
        address indexed seller
    );

    event ProductUpdated(
        string indexed productId,
        uint256 price,
        uint256 stock,
        bool active
    );

    event ProductPurchased(
        bytes32 indexed orderId,
        address indexed buyer,
        address indexed seller,
        string productId,
        string tokenSymbol,
        uint256 quantity,
        uint256 totalPrice,
        uint256 feePaid,
        uint256 timestamp
    );

    event OrderStatusUpdated(
        bytes32 indexed orderId,
        OrderStatus status,
        address indexed actor
    );

    event PaymentReleased(
        bytes32 indexed orderId,
        address indexed seller,
        uint256 amount
    );

    event OrderRefunded(
        bytes32 indexed orderId,
        address indexed buyer,
        uint256 amount
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesForwarded(address indexed treasury, uint256 amount);

    error InsufficientFee(uint256 required, uint256 provided);
    error InsufficientPayment(uint256 required, uint256 provided);
    error InsufficientStock(uint256 available, uint256 requested);
    error ProductNotActive(string productId);
    error ProductAlreadyExists(string productId);
    error InvalidQuantity();
    error InvalidAddress();
    error FeeTransferFailed();
    error PaymentTransferFailed();
    error UnauthorizedSeller(address caller);
    error InvalidOrderStatus(OrderStatus current, OrderStatus expected);

    constructor(address payable _treasury, uint256 _initialFee) Ownable(msg.sender) {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
        fee = _initialFee;
    }

    modifier onlyProductSellerOrOwner(string memory productId) {
        address seller = products[productId].seller;
        if (msg.sender != seller && msg.sender != owner()) {
            revert UnauthorizedSeller(msg.sender);
        }
        _;
    }

    /**
     * @notice Registers a product in the marketplace catalog with full category and inventory stock.
     */
    function registerProductFull(
        string memory id,
        string memory name,
        string memory tokenSymbol,
        string memory category,
        uint256 price,
        uint256 stock,
        address seller
    ) public {
        if (bytes(products[id].id).length > 0) {
            revert ProductAlreadyExists(id);
        }

        address productSeller = seller == address(0) ? msg.sender : seller;
        if (msg.sender != owner() && productSeller != msg.sender) {
            revert UnauthorizedSeller(msg.sender);
        }

        products[id] = ProductItem({
            id: id,
            name: name,
            tokenSymbol: tokenSymbol,
            category: category,
            price: price,
            seller: productSeller,
            stock: stock,
            active: true,
            totalSold: 0
        });

        registeredProductIds.push(id);
        _sellerProducts[productSeller].push(id);

        emit ProductRegistered(id, name, tokenSymbol, category, price, stock, productSeller);
    }

    /**
     * @notice Legacy / Simplified Product Registration for backward compatibility.
     */
    function registerProduct(
        string memory id,
        string memory name,
        string memory tokenSymbol,
        uint256 price,
        address seller
    ) external {
        registerProductFull(id, name, tokenSymbol, "General", price, 1_000_000, seller);
    }

    /**
     * @notice Updates price and stock of an existing product (Seller or Owner).
     */
    function updateProduct(
        string calldata id,
        uint256 newPrice,
        uint256 newStock,
        bool active
    ) external onlyProductSellerOrOwner(id) {
        ProductItem storage item = products[id];
        item.price = newPrice;
        item.stock = newStock;
        item.active = active;
        emit ProductUpdated(id, newPrice, newStock, active);
    }

    /**
     * @notice Sets active status of a product.
     */
    function setProductActive(string calldata id, bool active) external onlyProductSellerOrOwner(id) {
        products[id].active = active;
        emit ProductUpdated(id, products[id].price, products[id].stock, active);
    }

    /**
     * @notice Executes purchase of a product.
     *         Accepts HBAR/ETH payment covering product cost + fee, or just fee for off-chain / token purchases.
     *         Transfers protocol fee to treasury and holds product funds in escrow (if provided).
     */
    function buyProduct(
        string memory productId,
        string memory tokenSymbol,
        uint256 quantity,
        uint256 totalPrice
    ) public payable returns (bytes32 orderId) {
        return _executePurchase(productId, tokenSymbol, quantity, totalPrice);
    }

    /**
     * @notice Convenience overload for purchasing 1 or more units with product price calculation.
     */
    function buyProduct(
        string memory productId,
        uint256 quantity
    ) public payable returns (bytes32 orderId) {
        ProductItem memory item = products[productId];
        return _executePurchase(productId, item.tokenSymbol, quantity, item.price * quantity);
    }

    function _executePurchase(
        string memory productId,
        string memory tokenSymbol,
        uint256 quantity,
        uint256 totalPrice
    ) internal returns (bytes32 orderId) {
        if (quantity == 0) revert InvalidQuantity();
        ProductItem storage item = products[productId];
        if (!item.active && bytes(item.id).length > 0) revert ProductNotActive(productId);
        if (item.stock > 0 && item.stock < quantity) revert InsufficientStock(item.stock, quantity);

        uint256 requiredProductCost = item.price > 0 ? item.price * quantity : totalPrice;
        bool isFullNativePayment = (msg.value >= requiredProductCost + fee);

        if (!isFullNativePayment && msg.value < fee) {
            revert InsufficientFee(fee, msg.value);
        }

        uint256 actualFeePaid = fee;

        // Deduct inventory stock if managed
        if (item.stock >= quantity) {
            item.stock -= quantity;
        }

        totalPurchasesCount++;
        orderId = keccak256(
            abi.encodePacked(
                msg.sender,
                productId,
                quantity,
                requiredProductCost,
                block.timestamp,
                totalPurchasesCount
            )
        );

        address sellerAddr = item.seller == address(0) ? treasury : item.seller;

        orders[orderId] = PurchaseOrder({
            orderId: orderId,
            buyer: msg.sender,
            seller: sellerAddr,
            productId: productId,
            tokenSymbol: tokenSymbol,
            quantity: quantity,
            unitPrice: item.price > 0 ? item.price : (totalPrice / quantity),
            totalPrice: requiredProductCost,
            feePaid: actualFeePaid,
            timestamp: block.timestamp,
            status: OrderStatus.PLACED,
            escrowed: isFullNativePayment
        });

        _buyerOrders[msg.sender].push(orderId);
        _sellerOrders[sellerAddr].push(orderId);
        totalProductVolume[productId] += quantity;
        item.totalSold += quantity;
        totalProtocolFeesCollected += actualFeePaid;

        // Forward protocol fee to treasury
        if (actualFeePaid > 0) {
            (bool success, ) = treasury.call{value: actualFeePaid}("");
            if (!success) revert FeeTransferFailed();
            emit FeesForwarded(treasury, actualFeePaid);
        }

        // Refund any overpayment beyond product cost + fee
        if (isFullNativePayment && msg.value > (requiredProductCost + actualFeePaid)) {
            uint256 refundAmount = msg.value - (requiredProductCost + actualFeePaid);
            (bool refundSuccess, ) = payable(msg.sender).call{value: refundAmount}("");
            require(refundSuccess, "Overpayment refund failed");
        }

        emit ProductPurchased(
            orderId,
            msg.sender,
            sellerAddr,
            productId,
            tokenSymbol,
            quantity,
            requiredProductCost,
            actualFeePaid,
            block.timestamp
        );
    }

    /**
     * @notice Seller updates order status to DISPATCHED.
     */
    function dispatchOrder(bytes32 orderId) external {
        PurchaseOrder storage order = orders[orderId];
        if (msg.sender != order.seller && msg.sender != owner()) revert UnauthorizedSeller(msg.sender);
        if (order.status != OrderStatus.PLACED) revert InvalidOrderStatus(order.status, OrderStatus.PLACED);

        order.status = OrderStatus.DISPATCHED;
        emit OrderStatusUpdated(orderId, OrderStatus.DISPATCHED, msg.sender);
    }

    /**
     * @notice Seller, Buyer, or Owner marks order as DELIVERED.
     */
    function deliverOrder(bytes32 orderId) external {
        PurchaseOrder storage order = orders[orderId];
        if (msg.sender != order.seller && msg.sender != order.buyer && msg.sender != owner()) {
            revert UnauthorizedSeller(msg.sender);
        }
        if (order.status != OrderStatus.DISPATCHED && order.status != OrderStatus.PLACED) {
            revert InvalidOrderStatus(order.status, OrderStatus.DISPATCHED);
        }

        order.status = OrderStatus.DELIVERED;
        emit OrderStatusUpdated(orderId, OrderStatus.DELIVERED, msg.sender);
    }

    /**
     * @notice Confirms order delivery and releases held escrow funds to seller.
     */
    function confirmAndReleasePayment(bytes32 orderId) external {
        PurchaseOrder storage order = orders[orderId];
        if (msg.sender != order.buyer && msg.sender != order.seller && msg.sender != owner()) {
            revert UnauthorizedSeller(msg.sender);
        }
        if (order.status == OrderStatus.COMPLETED || order.status == OrderStatus.CANCELLED) {
            revert InvalidOrderStatus(order.status, OrderStatus.DELIVERED);
        }

        order.status = OrderStatus.COMPLETED;
        emit OrderStatusUpdated(orderId, OrderStatus.COMPLETED, msg.sender);

        if (order.escrowed && order.totalPrice > 0) {
            order.escrowed = false;
            (bool success, ) = payable(order.seller).call{value: order.totalPrice}("");
            if (!success) revert PaymentTransferFailed();
            emit PaymentReleased(orderId, order.seller, order.totalPrice);
        }
    }

    /**
     * @notice Cancels order, restores inventory stock, and refunds buyer escrow funds.
     */
    function cancelAndRefundOrder(bytes32 orderId) external {
        PurchaseOrder storage order = orders[orderId];
        if (msg.sender != order.buyer && msg.sender != order.seller && msg.sender != owner()) {
            revert UnauthorizedSeller(msg.sender);
        }
        if (order.status == OrderStatus.COMPLETED || order.status == OrderStatus.CANCELLED) {
            revert InvalidOrderStatus(order.status, OrderStatus.PLACED);
        }

        // Only buyer can cancel prior to dispatch unless seller/owner approves
        if (msg.sender == order.buyer && order.status != OrderStatus.PLACED) {
            revert InvalidOrderStatus(order.status, OrderStatus.PLACED);
        }

        order.status = OrderStatus.CANCELLED;
        // Restock inventory
        products[order.productId].stock += order.quantity;
        emit OrderStatusUpdated(orderId, OrderStatus.CANCELLED, msg.sender);

        if (order.escrowed && order.totalPrice > 0) {
            order.escrowed = false;
            (bool success, ) = payable(order.buyer).call{value: order.totalPrice}("");
            if (!success) revert PaymentTransferFailed();
            emit OrderRefunded(orderId, order.buyer, order.totalPrice);
        }
    }

    function setTreasury(address payable _newTreasury) external onlyOwner {
        if (_newTreasury == address(0)) revert InvalidAddress();
        emit TreasuryUpdated(treasury, _newTreasury);
        treasury = _newTreasury;
    }

    function setFee(uint256 _newFee) external onlyOwner {
        emit FeeUpdated(fee, _newFee);
        fee = _newFee;
    }

    function getBuyerOrders(address buyer) external view returns (bytes32[] memory) {
        return _buyerOrders[buyer];
    }

    function getSellerOrders(address seller) external view returns (bytes32[] memory) {
        return _sellerOrders[seller];
    }

    function getProductsBySeller(address seller) external view returns (string[] memory) {
        return _sellerProducts[seller];
    }

    function getRegisteredProductsCount() external view returns (uint256) {
        return registeredProductIds.length;
    }

    receive() external payable {
        if (msg.value > 0) {
            totalProtocolFeesCollected += msg.value;
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success, "Treasury transfer failed");
        }
    }
}

