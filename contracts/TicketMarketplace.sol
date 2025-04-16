// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./Ticket.sol";
import "./PreRegistration.sol";

contract TicketMarketplace is Ownable {
    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(address => mapping(uint256 => Listing)) public listings; // ticketContract => tokenId => listing
    uint256 public marketplaceFeePercentage = 0; // Example: 0 for no fee
    address public preRegistrationContractAddress;

    event TicketListed(address indexed ticketContract, uint256 indexed tokenId, address seller, uint256 price);
    event TicketBought(address indexed ticketContract, uint256 indexed tokenId, address buyer, address seller, uint256 price);
    event TicketDelisted(address indexed ticketContract, uint256 indexed tokenId, address seller);
    event PreRegistrationContractAddressUpdated(address newAddress); // Added

    constructor(address _preRegistrationContractAddress) Ownable(msg.sender) {
        preRegistrationContractAddress = _preRegistrationContractAddress;
    }

    function updatePreRegistrationContractAddress(address _newAddress) public onlyOwner { // Added
        require(_newAddress != address(0), "Address cannot be zero.");
        preRegistrationContractAddress = _newAddress;
        emit PreRegistrationContractAddressUpdated(_newAddress);
    }

    function listItem(address _ticketContractAddress, uint256 _tokenId, uint256 _price) public {
        Ticket ticketContract = Ticket(_ticketContractAddress);
        require(ticketContract.ownerOf(_tokenId) == msg.sender, "You are not the owner of this ticket.");
        require(listings[_ticketContractAddress][_tokenId].seller == address(0), "Ticket is already listed.");

        PreRegistration preRegistration = PreRegistration(preRegistrationContractAddress);
        uint256 originalPrice = preRegistration.getOriginalPurchasePrice(_ticketContractAddress, _tokenId);
        uint256 profitCapPercentage = preRegistration.getResaleProfitCapPercentage(_ticketContractAddress);

        // Calculate maximum allowed resale price
        uint256 maxResalePrice = originalPrice + (originalPrice /100)*profitCapPercentage;

        require(_price <= maxResalePrice, "Listing price exceeds the allowed profit cap.");

        listings[_ticketContractAddress][_tokenId] = Listing(msg.sender, _price);
        emit TicketListed(_ticketContractAddress, _tokenId, msg.sender, _price);
    }

    function buyTicket(address _ticketContractAddress, uint256 _tokenId) public payable {
        Listing memory listing = listings[_ticketContractAddress][_tokenId];
        require(listing.seller != address(0), "Ticket is not listed for sale.");
        require(msg.sender != listing.seller, "You cannot buy your own ticket.");
        require(msg.value >= listing.price, "Insufficient funds.");

        delete listings[_ticketContractAddress][_tokenId];

        // Transfer ticket to buyer
        IERC721(_ticketContractAddress).safeTransferFrom(listing.seller, msg.sender, _tokenId);

        // Transfer funds to seller (minus marketplace fee)
        uint256 feeAmount = listing.price * (marketplaceFeePercentage / 100);
        uint256 sellerAmount = listing.price - feeAmount;
        (bool successSeller, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(successSeller, "Seller payment failed.");

        // Handle marketplace fee (e.g., transfer to owner)
        if (feeAmount > 0) {
            (bool successFee, ) = payable(owner()).call{value: feeAmount}("");
            require(successFee, "Marketplace fee transfer failed.");
        }

        emit TicketBought(_ticketContractAddress, _tokenId, msg.sender, listing.seller, listing.price);
    }

    function delistItem(address _ticketContractAddress, uint256 _tokenId) public {
        require(listings[_ticketContractAddress][_tokenId].seller == msg.sender, "You are not the seller of this ticket.");
        delete listings[_ticketContractAddress][_tokenId];
        emit TicketDelisted(_ticketContractAddress, _tokenId, msg.sender);
    }

    function setMarketplaceFeePercentage(uint256 _feePercentage) public onlyOwner {
        require(_feePercentage <= 100, "Fee percentage cannot exceed 100.");
        marketplaceFeePercentage = _feePercentage;
    }
}