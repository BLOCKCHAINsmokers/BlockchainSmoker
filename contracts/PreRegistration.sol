// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Ticket.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./LoyaltyProgram.sol";

contract PreRegistration is Ownable {
    using SafeMath for uint256;

    mapping(address => mapping(address => bool)) public isRegistered; // eventContract => user => registered
    mapping(address => mapping(address => uint256)) public payments; // eventContract => user => amountPaid
    mapping(address => mapping(address => uint256)) public purchaseSlotStart; // eventContract => user => startTime
    mapping(address => mapping(address => uint256)) public purchaseSlotEnd; // eventContract => user => endTime
    mapping(address => mapping(uint256 => uint256)) public ticketPrices; // eventContract => categoryId => price
    mapping(address => mapping(uint256 => uint256)) public availableTickets; // eventContract => categoryId => count
    mapping(address => mapping(address => bool)) public hasPurchased; // eventContract => user => hasPurchased
    mapping(address => address[]) private paidRegistrants; // eventContract => array of users who paid
    mapping(address => uint256) private ballotNonce; // eventContract => nonce for randomness
    mapping(address => mapping(string => uint256)) private mintedTicketCountByCategory; // eventContract => category => count
    mapping(address => mapping(uint256 => bool)) private ticketPurchasedMap; // eventContract => tokenId => purchased
    mapping(address => uint256) private maxPurchaseQuantityPerBuyer; // eventContract => quantity limit
    mapping(address => uint256) private resaleProfitCapPercentage; // eventContract => profit cap percentage
    mapping(address => mapping(uint256 => uint256)) public originalPurchasePrice; // eventContract => tokenId => price
    address public loyaltyProgramAddress;

    event Registration(address eventContract, address user);
    event PaymentDeposited(address eventContract, address user, uint256 amount);
    event BallotStarted(address eventContract);
    event PurchaseSlotAllocated(address eventContract, address user, uint256 startTime, uint256 endTime);
    event TicketPurchased(address eventContract, address buyer, uint256[] tokenIds);
    event PaymentRefunded(address eventContract, address user, uint256 amount);
    event MaxPurchaseQuantitySet(address eventContract, uint256 quantity);
    event ResaleProfitCapPercentageSet(address eventContract, uint256 percentage);
    event LoyaltyProgramAddressUpdated(address newAddress); // Added

    uint256 public purchaseSlotDuration = 3600; // 1 hour in seconds
    uint256 public bufferBetweenSlots = 1800; // 30 minutes in seconds
    uint256 public pointsPerTicket = 5; // Example: Award 5 points per ticket

    constructor(address _loyaltyProgramAddress) {
        loyaltyProgramAddress = _loyaltyProgramAddress;
    }

    function updateLoyaltyProgramAddress(address _newAddress) public onlyOwner { // Added
        require(_newAddress != address(0), "Address cannot be zero.");
        loyaltyProgramAddress = _newAddress;
        emit LoyaltyProgramAddressUpdated(_newAddress);
    }

    function setPointsPerTicket(uint256 _points) public onlyOwner {
        pointsPerTicket = _points;
    }

    function setMaxPurchaseQuantity(address _eventContractAddress, uint256 _quantity) public onlyOwner {
        maxPurchaseQuantityPerBuyer[_eventContractAddress] = _quantity;
        emit MaxPurchaseQuantitySet(_eventContractAddress, _quantity);
    }

    function setResaleProfitCapPercentage(address _eventContractAddress, uint256 _percentage) public onlyOwner {
        resaleProfitCapPercentage[_eventContractAddress] = _percentage;
        emit ResaleProfitCapPercentageSet(_eventContractAddress, _percentage);
    }

    function getResaleProfitCapPercentage(address _eventContractAddress) public view returns (uint256) {
        return resaleProfitCapPercentage[_eventContractAddress];
    }

    function registerForEvent(address _eventContractAddress) public {
        require(!isRegistered[_eventContractAddress][msg.sender], "Already registered for this event.");
        isRegistered[_eventContractAddress][msg.sender] = true;
        emit Registration(_eventContractAddress, msg.sender);
    }

    function depositPayment(address _eventContractAddress) public payable {
        require(isRegistered[_eventContractAddress][msg.sender], "Not registered for this event.");
        require(payments[_eventContractAddress][msg.sender] == 0, "Payment already deposited.");
        payments[_eventContractAddress][msg.sender] = msg.value;
        paidRegistrants[_eventContractAddress].push(msg.sender);
        emit PaymentDeposited(_eventContractAddress, msg.sender, msg.value);
    }

    function setTicketPrice(address _eventContractAddress, uint256 _categoryId, uint256 _price) public onlyOwner {
        ticketPrices[_eventContractAddress][_categoryId] = _price;
    }

    function setAvailableTickets(address _eventContractAddress, uint256 _categoryId, uint256 _count) public onlyOwner {
        availableTickets[_eventContractAddress][_categoryId] = _count;
    }

    function setPurchaseSlotDuration(uint256 _duration) public onlyOwner {
        purchaseSlotDuration = _duration;
    }

    function setBufferBetweenSlots(uint256 _buffer) public onlyOwner {
        bufferBetweenSlots = _buffer;
    }

    function startBallot(address _eventContractAddress) public onlyOwner {
        require(paidRegistrants[_eventContractAddress].length > 0, "No paid registrants for this event.");
        emit BallotStarted(_eventContractAddress);
        _performBallot(_eventContractAddress);
    }

    function _performBallot(address _eventContractAddress) internal {
        address[] memory registrants = paidRegistrants[_eventContractAddress];
        uint256 numRegistrants = registrants.length;
        uint256 currentNonce = ballotNonce[_eventContractAddress]++;

        // Shuffle the array using Fisher-Yates algorithm
        for (uint256 i = numRegistrants - 1; i > 0; i--) {
            uint256 randomIndex = _getRandomNumber(_eventContractAddress, i + 1, currentNonce);
            address temp = registrants[i];
            registrants[i] = registrants[randomIndex];
            registrants[randomIndex] = temp;
            currentNonce++;
        }

        // Allocate purchase slots
        uint256 startTime = block.timestamp + 1 days; // Example: Purchase window starts in 1 day
        for (uint256 i = 0; i < numRegistrants; i++) {
            purchaseSlotStart[_eventContractAddress][registrants[i]] = startTime;
            purchaseSlotEnd[_eventContractAddress][registrants[i]] = startTime + purchaseSlotDuration;
            emit PurchaseSlotAllocated(_eventContractAddress, registrants[i], startTime, startTime + purchaseSlotDuration);
            startTime += purchaseSlotDuration + bufferBetweenSlots;
        }
    }

    function _getRandomNumber(address _eventContractAddress, uint256 _modulus, uint256 _nonce) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, _eventContractAddress, _nonce))) % _modulus;
    }

    function purchaseTicket(address _eventContractAddress, uint256[] memory _tokenIds) public payable {
        require(isRegistered[_eventContractAddress][msg.sender], "Not registered for this event.");
        require(payments[_eventContractAddress][msg.sender] > 0, "Payment not deposited.");
        require(block.timestamp >= purchaseSlotStart[_eventContractAddress][msg.sender] && block.timestamp <= purchaseSlotEnd[_eventContractAddress][msg.sender], "Purchase window not active.");
        require(!hasPurchased[_eventContractAddress][msg.sender], "Already purchased a ticket for this event."); // Basic check

        uint256 numTickets = _tokenIds.length;
        require(numTickets > 0, "Must purchase at least one ticket.");
        uint256 limit = maxPurchaseQuantityPerBuyer[_eventContractAddress];
        require(numTickets <= limit, "Cannot purchase more than the allowed limit for this event.");

        Ticket eventContract = Ticket(_eventContractAddress);
        uint256 totalCost = 0;

        // Check availability for each tokenId
        for (uint256 i = 0; i < numTickets; i++) {
            uint256 tokenId = _tokenIds[i];
            require(eventContract.ownerOf(tokenId) == address(0), "Ticket is not available.");
            uint256 ticketPrice = eventContract.price(tokenId);
            totalCost = totalCost.add(ticketPrice);
            originalPurchasePrice[_eventContractAddress][tokenId] = ticketPrice; // Record original purchase price
        }

        require(payments[_eventContractAddress][msg.sender] >= totalCost, "Insufficient payment.");

        // Transfer tickets
        for (uint256 i = 0; i < numTickets; i++) {
            eventContract.safeTransferFrom(address(0), msg.sender, _tokenIds[i]);
            ticketPurchasedMap[_eventContractAddress][_tokenIds[i]] = true;
        }
        hasPurchased[_eventContractAddress][msg.sender] = true; // Update purchase status

        // Award loyalty points
        if (loyaltyProgramAddress != address(0)) {
            LoyaltyProgram(loyaltyProgramAddress).addPoints(msg.sender, numTickets * pointsPerTicket);
        }

        emit TicketPurchased(_eventContractAddress, msg.sender, _tokenIds);
        // Potentially transfer funds to the event organizer here.
    }

    function refundUnusedPayment(address _eventContractAddress) public onlyOwner {
        for (uint256 i = 0; i < paidRegistrants[_eventContractAddress].length; i++) {
            address user = paidRegistrants[_eventContractAddress][i];
            if (!hasPurchased[_eventContractAddress][user] && payments[_eventContractAddress][user] > 0) {
                uint256 amountToRefund = payments[_eventContractAddress][user];
                payments[_eventContractAddress][user] = 0;
                (bool success, ) = payable(user).call{value: amountToRefund}("");
                require(success, "Payment refund failed.");
                emit PaymentRefunded(_eventContractAddress, user, amountToRefund);
            }
        }
        delete paidRegistrants[_eventContractAddress]; // Clear the list after refunding
    }

    function getPaidRegistrants(address _eventContractAddress) public view returns (address[] memory) {
        return paidRegistrants[_eventContractAddress];
    }

    function recordMintedTickets(address _eventContractAddress, string memory _category, uint256 _count) public onlyOwner {
        mintedTicketCountByCategory[_eventContractAddress][_category] += _count;
    }

    function getAvailableTicketsByCategory(address _eventContractAddress, string memory _category) public view returns (uint256[] memory) {
        Ticket eventContract = Ticket(_eventContractAddress);
        uint256 totalMinted = mintedTicketCountByCategory[_eventContractAddress][_category];
        uint256[] memory availableTokenIds = new uint256[](totalMinted); // Optimistic sizing
        uint256 availableCount = 0;
        uint256 currentTokenId = 0;
        uint256 mintedSoFar = 0;
        while (mintedSoFar < totalMinted) {
            try {
                address owner = eventContract.ownerOf(currentTokenId);
                string memory ticketCategory = eventContract.category(currentTokenId);
                if (owner == address(0) && keccak256(bytes(ticketCategory)) == keccak256(bytes(_category)) && !ticketPurchasedMap[_eventContractAddress][currentTokenId]) {
                    availableTokenIds[availableCount] = currentTokenId;
                    availableCount++;
                }
                mintedSoFar++;
                currentTokenId++;
            } catch (bytes memory reason) {
                break;
            }
        }
        uint256[] memory result = new uint256[](availableCount);
        for (uint256 i = 0; i < availableCount; i++) {
            result[i] = availableTokenIds[i];
        }
        return result;
    }

    function getMaxPurchaseQuantityPerBuyer(address _eventContractAddress) public view returns (uint256) {
        return maxPurchaseQuantityPerBuyer[_eventContractAddress];
    }

    function getOriginalPurchasePrice(address _eventContractAddress, uint256 _tokenId) public view returns (uint256) {
        return originalPurchasePrice[_eventContractAddress][_tokenId];
    }
}