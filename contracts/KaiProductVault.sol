// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KaiProductVault
 * @notice On-chain EVM registry and execution vault for KAI Products and Ecosystem interactions.
 *         Accepts a low HBAR protocol fee on product operations (deposit, withdraw, ecosystem action)
 *         and forwards the fee directly to the protocol treasury account.
 */
contract KaiProductVault is Ownable {
    address payable public treasury;
    uint256 public fee; // in wei, default 0.001 ether (0.001 HBAR on Hedera)
    uint256 public totalProtocolFeesCollected;

    // user => productId => balance
    mapping(address => mapping(string => uint256)) public userProductBalances;
    // productId => total volume
    mapping(string => uint256) public productTotalVolume;
    // user => total interactions count
    mapping(address => uint256) public userInteractionCount;

    event ProductDeposit(
        address indexed user,
        string productId,
        string tokenSymbol,
        uint256 amount,
        uint256 feePaid,
        uint256 timestamp
    );

    event ProductWithdraw(
        address indexed user,
        string productId,
        string tokenSymbol,
        uint256 amount,
        uint256 feePaid,
        uint256 timestamp
    );

    event EcosystemAction(
        address indexed user,
        string actionType,
        string details,
        uint256 amount,
        uint256 feePaid,
        uint256 timestamp
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesForwarded(address indexed treasury, uint256 amount);

    error InsufficientFee(uint256 required, uint256 provided);
    error InvalidAddress();
    error FeeTransferFailed();

    constructor(address payable _treasury, uint256 _initialFee) Ownable(msg.sender) {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
        fee = _initialFee;
    }

    /**
     * @notice Deposit tokens into a product.
     * @param productId The identifier of the product (e.g. 'trust', 'pension', 'honey', etc.)
     * @param tokenSymbol The token symbol (e.g. 'NVR', 'YTOKEN', etc.)
     * @param amount The quantity deposited
     */
    function deposit(
        string calldata productId,
        string calldata tokenSymbol,
        uint256 amount
    ) external payable {
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);

        userProductBalances[msg.sender][productId] += amount;
        productTotalVolume[productId] += amount;
        userInteractionCount[msg.sender] += 1;
        totalProtocolFeesCollected += msg.value;

        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            if (!success) revert FeeTransferFailed();
            emit FeesForwarded(treasury, msg.value);
        }

        emit ProductDeposit(
            msg.sender,
            productId,
            tokenSymbol,
            amount,
            msg.value,
            block.timestamp
        );
    }

    /**
     * @notice Withdraw tokens from a product.
     */
    function withdraw(
        string calldata productId,
        string calldata tokenSymbol,
        uint256 amount
    ) external payable {
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        uint256 currentBalance = userProductBalances[msg.sender][productId];
        if (currentBalance >= amount) {
            userProductBalances[msg.sender][productId] -= amount;
        }
        userInteractionCount[msg.sender] += 1;
        totalProtocolFeesCollected += msg.value;

        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            if (!success) revert FeeTransferFailed();
            emit FeesForwarded(treasury, msg.value);
        }

        emit ProductWithdraw(
            msg.sender,
            productId,
            tokenSymbol,
            amount,
            msg.value,
            block.timestamp
        );
    }

    /**
     * @notice Execute an action across the KAI ecosystem (governance, policy, staking, agent task).
     */
    function executeEcosystemAction(
        string calldata actionType,
        string calldata details,
        uint256 amount
    ) external payable {
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        userInteractionCount[msg.sender] += 1;
        totalProtocolFeesCollected += msg.value;

        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            if (!success) revert FeeTransferFailed();
            emit FeesForwarded(treasury, msg.value);
        }

        emit EcosystemAction(
            msg.sender,
            actionType,
            details,
            amount,
            msg.value,
            block.timestamp
        );
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

    function getProductBalance(address user, string calldata productId) external view returns (uint256) {
        return userProductBalances[user][productId];
    }

    receive() external payable {
        if (msg.value > 0) {
            totalProtocolFeesCollected += msg.value;
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success, "Transfer failed");
        }
    }
}
