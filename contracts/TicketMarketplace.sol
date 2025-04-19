// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./Ticket.sol";
import "./PreRegistration.sol";

contract TicketMarketplace is Ownable {
    struct Listing {
        address seller;
        uint256 price;
    }

    struct Bid {
        address bidder;
        uint256 amount;
    }

    mapping(address => mapping(uint256 => Listing)) public listings; // ticketContract => tokenId => listing
    mapping(address => mapping(uint256 => Bid)) public highestBids; // ticketContract => tokenId => bid
    mapping(address => mapping(uint256 => uint256)) public biddingEndTime; // ticketContract => tokenId => end time
    uint256 public marketplaceFeePercentage = 0; // Example: 0 for no fee
    uint256 public constant BIDDING_PERIOD = 3 days; // 3-day bidding period
    address public preRegistrationContractAddress;

    event TicketListed(address indexed ticketContract, uint256 indexed tokenId, address seller, uint256 price);
    event TicketBought(address indexed ticketContract, uint256 indexed tokenId, address buyer, address seller, uint256 price);
    event TicketDelisted(address indexed ticketContract, uint256 indexed tokenId, address seller);
    event PreRegistrationContractAddressUpdated(address newAddress);
    event BidPlaced(address indexed ticketContract, uint256 indexed tokenId, address bidder, uint256 amount);
    event BidAccepted(address indexed ticketContract, uint256 indexed tokenId, address bidder, uint256 amount);
    event AuctionEnded(address indexed ticketContract, uint256 indexed tokenId, address winner, uint256 winningBid);

    constructor(address _preRegistrationContractAddress) Ownable(msg.sender) {
        preRegistrationContractAddress = _preRegistrationContractAddress;
    }

    function updatePreRegistrationContractAddress(address _newAddress) public onlyOwner {
        require(_newAddress != address(0), "Address cannot be zero.");
        preRegistrationContractAddress = _newAddress;
        emit PreRegistrationContractAddressUpdated(_newAddress);
    }

    function listItem(address _ticketContractAddress, uint256 _tokenId, uint256 _price) public {
        Ticket ticketContract = Ticket(_ticketContractAddress);
        require(ticketContract.ownerOf(_tokenId) == msg.sender, "You are not the owner of this ticket.");
        require(listings[_ticketContractAddress][_tokenId].seller == address(0), "Ticket is already listed.");
        require(ticketContract.getApproved(_tokenId) == address(this), "Marketplace is not approved to transfer this ticket.");

        PreRegistration preRegistration = PreRegistration(preRegistrationContractAddress);
        uint256 originalPrice = preRegistration.getOriginalPurchasePrice(_ticketContractAddress, _tokenId);
        uint256 profitCapPercentage = preRegistration.getResaleProfitCapPercentage(_ticketContractAddress);

        // Calculate maximum allowed resale price
        uint256 maxResalePrice = originalPrice + (originalPrice /100)*profitCapPercentage;

        require(_price <= maxResalePrice, "Listing price exceeds the allowed profit cap.");

        listings[_ticketContractAddress][_tokenId] = Listing(msg.sender, _price);
        // Transfer ticket to marketplace contract
        ticketContract.safeTransferFrom(msg.sender, address(this), _tokenId);
        emit TicketListed(_ticketContractAddress, _tokenId, msg.sender, _price);
    }

    function listItemForAuction(address _ticketContractAddress, uint256 _tokenId, uint256 _minPrice) public {
        Ticket ticketContract = Ticket(_ticketContractAddress);
        require(ticketContract.ownerOf(_tokenId) == msg.sender, "You are not the owner of this ticket.");
        require(listings[_ticketContractAddress][_tokenId].seller == address(0), "Ticket is already listed.");
        require(ticketContract.getApproved(_tokenId) == address(this), "Marketplace is not approved to transfer this ticket.");

        PreRegistration preRegistration = PreRegistration(preRegistrationContractAddress);
        uint256 originalPrice = preRegistration.getOriginalPurchasePrice(_ticketContractAddress, _tokenId);
        uint256 profitCapPercentage = preRegistration.getResaleProfitCapPercentage(_ticketContractAddress);

        // Calculate maximum allowed resale price
        uint256 maxResalePrice = originalPrice + (originalPrice /100)*profitCapPercentage;

        require(_minPrice <= maxResalePrice, "Minimum price exceeds the allowed profit cap.");

        listings[_ticketContractAddress][_tokenId] = Listing(msg.sender, _minPrice);
        biddingEndTime[_ticketContractAddress][_tokenId] = block.timestamp + BIDDING_PERIOD;
        // Transfer ticket to marketplace contract
        ticketContract.safeTransferFrom(msg.sender, address(this), _tokenId);
        emit TicketListed(_ticketContractAddress, _tokenId, msg.sender, _minPrice);
    }

    function placeBid(address _ticketContractAddress, uint256 _tokenId) public payable {
        require(listings[_ticketContractAddress][_tokenId].seller != address(0), "Ticket is not listed for sale.");
        require(block.timestamp < biddingEndTime[_ticketContractAddress][_tokenId], "Bidding period has ended.");
        require(msg.sender != listings[_ticketContractAddress][_tokenId].seller, "You cannot bid on your own ticket.");
        
        Bid storage currentBid = highestBids[_ticketContractAddress][_tokenId];
        uint256 minBid = listings[_ticketContractAddress][_tokenId].price;
        
        if (currentBid.amount > 0) {
            minBid = currentBid.amount + (currentBid.amount / 10); // 10% higher than current bid
        }
        
        require(msg.value >= minBid, "Bid amount is too low.");

        // Refund previous highest bidder
        if (currentBid.amount > 0) {
            payable(currentBid.bidder).transfer(currentBid.amount);
        }

        // Record new highest bid
        highestBids[_ticketContractAddress][_tokenId] = Bid(msg.sender, msg.value);
        emit BidPlaced(_ticketContractAddress, _tokenId, msg.sender, msg.value);
    }

    function acceptBid(address _ticketContractAddress, uint256 _tokenId) public {
        require(listings[_ticketContractAddress][_tokenId].seller == msg.sender, "Only the seller can accept a bid.");
        Bid memory winningBid = highestBids[_ticketContractAddress][_tokenId];
        require(winningBid.amount > 0, "No bids to accept.");
        
        _processBid(_ticketContractAddress, _tokenId, winningBid.bidder, winningBid.amount);
        emit BidAccepted(_ticketContractAddress, _tokenId, winningBid.bidder, winningBid.amount);
    }

    function finalizeAuction(address _ticketContractAddress, uint256 _tokenId) public {
        require(block.timestamp >= biddingEndTime[_ticketContractAddress][_tokenId], "Bidding period has not ended yet.");
        Bid memory winningBid = highestBids[_ticketContractAddress][_tokenId];
        
        if (winningBid.amount > 0) {
            _processBid(_ticketContractAddress, _tokenId, winningBid.bidder, winningBid.amount);
            emit AuctionEnded(_ticketContractAddress, _tokenId, winningBid.bidder, winningBid.amount);
        } else {
            // No bids, return ticket to seller
            Ticket ticketContract = Ticket(_ticketContractAddress);
            ticketContract.safeTransferFrom(address(this), listings[_ticketContractAddress][_tokenId].seller, _tokenId);
            delete listings[_ticketContractAddress][_tokenId];
            delete highestBids[_ticketContractAddress][_tokenId];
            delete biddingEndTime[_ticketContractAddress][_tokenId];
        }
    }

    function _processBid(address _ticketContractAddress, uint256 _tokenId, address buyer, uint256 amount) private {
        address seller = listings[_ticketContractAddress][_tokenId].seller;
        
        // Transfer ticket to buyer
        IERC721(_ticketContractAddress).safeTransferFrom(address(this), buyer, _tokenId);

        // Transfer funds to seller (minus marketplace fee)
        uint256 feeAmount = (amount / 100) * (marketplaceFeePercentage);
        uint256 sellerAmount = amount - feeAmount;
        (bool successSeller, ) = payable(seller).call{value: sellerAmount}("");
        require(successSeller, "Seller payment failed.");

        // Handle marketplace fee (e.g., transfer to owner)
        if (feeAmount > 0) {
            (bool successFee, ) = payable(owner()).call{value: feeAmount}("");
            require(successFee, "Marketplace fee transfer failed.");
        }

        // Clean up
        delete listings[_ticketContractAddress][_tokenId];
        delete highestBids[_ticketContractAddress][_tokenId];
        delete biddingEndTime[_ticketContractAddress][_tokenId];
    }

    function buyTicket(address _ticketContractAddress, uint256 _tokenId) public payable {
        Listing memory listing = listings[_ticketContractAddress][_tokenId];
        require(listing.seller != address(0), "Ticket is not listed for sale.");
        require(msg.sender != listing.seller, "You cannot buy your own ticket.");
        require(msg.value >= listing.price, "Insufficient funds.");

        delete listings[_ticketContractAddress][_tokenId];

        // Transfer ticket to buyer
        IERC721(_ticketContractAddress).safeTransferFrom(address(this), msg.sender, _tokenId);

        // Transfer funds to seller (minus marketplace fee)
        uint256 feeAmount = (listing.price / 100) * (marketplaceFeePercentage);
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
        require(highestBids[_ticketContractAddress][_tokenId].amount == 0, "Cannot delist with active bids.");
        
        Ticket ticketContract = Ticket(_ticketContractAddress);
        require(ticketContract.ownerOf(_tokenId) == address(this), "Marketplace does not own this ticket.");
        
        // Transfer ticket back to seller
        ticketContract.safeTransferFrom(address(this), msg.sender, _tokenId);
        
        // Delete the listing
        delete listings[_ticketContractAddress][_tokenId];
        delete biddingEndTime[_ticketContractAddress][_tokenId];
        emit TicketDelisted(_ticketContractAddress, _tokenId, msg.sender);
    }

    function setMarketplaceFeePercentage(uint256 _feePercentage) public onlyOwner {
        require(_feePercentage <= 100, "Fee percentage cannot exceed 100.");
        marketplaceFeePercentage = _feePercentage;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}