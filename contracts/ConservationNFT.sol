// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ConservationNFT
 * @notice Public-mint ERC-721. Each mint costs a small fixed network fee that
 *         goes to the contract owner. Minters supply their own token URI
 *         (IPFS CID recommended).
 */
contract ConservationNFT is ERC721URIStorage, Ownable {
    uint256 public mintPrice;        // in wei, e.g. 0.001 ETH
    uint256 public nextTokenId;
    uint256 public maxSupply;

    event Minted(address indexed to, uint256 indexed tokenId, string uri);
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event Withdrawn(address indexed to, uint256 amount);

    error InsufficientPayment(uint256 required, uint256 sent);
    error MaxSupplyReached(uint256 maxSupply);
    error ZeroAddress();
    error NothingToWithdraw();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 mintPrice_,  // in wei
        uint256 maxSupply_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        mintPrice = mintPrice_;
        maxSupply = maxSupply_;
    }

    /**
     * @notice Mint one NFT. Send exactly mintPrice ETH.
     * @param to      Recipient address.
     * @param tokenURI_ IPFS or HTTP URI for token metadata.
     */
    function mint(address to, string calldata tokenURI_) external payable {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value < mintPrice) revert InsufficientPayment(mintPrice, msg.value);
        if (nextTokenId >= maxSupply) revert MaxSupplyReached(maxSupply);

        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        // Refund any overpayment
        if (msg.value > mintPrice) {
            payable(msg.sender).transfer(msg.value - mintPrice);
        }

        emit Minted(to, tokenId, tokenURI_);
    }

    /** @notice Owner can update the mint price. */
    function setMintPrice(uint256 newPrice) external onlyOwner {
        emit MintPriceUpdated(mintPrice, newPrice);
        mintPrice = newPrice;
    }

    /** @notice Withdraw accumulated network fees to owner. */
    function withdraw() external onlyOwner {
        uint256 bal = address(this).balance;
        if (bal == 0) revert NothingToWithdraw();
        payable(owner()).transfer(bal);
        emit Withdrawn(owner(), bal);
    }

    /** @notice Total minted so far. */
    function totalMinted() external view returns (uint256) {
        return nextTokenId;
    }
}
