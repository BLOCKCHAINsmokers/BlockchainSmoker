// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Ticket.sol";
import "./PreRegistration.sol";

contract TicketFactory is Ownable {
    mapping(uint256 => address) public eventContracts;
    uint256 public eventCount;
    mapping(address => mapping(address => bool)) public isEventCreator;
    mapping(address => mapping(address => bool)) public marketplaceApproval;
    address public preRegistrationContractAddress;

    event EventCreated(
        uint256 eventId,
        address eventContractAddress,
        string eventName,
        address creator,
        string country,
        string city,
        uint256 maxPurchaseQuantityPerBuyer,
        uint256 resaleProfitCapPercentage // Added
    );
    event TicketsCreated(address eventContractAddress, string category, uint256 numTickets);
    event MarketplaceApprovalSet(address eventContractAddress, address marketplaceContract, bool approved);

    constructor(address _preRegistrationContractAddress) {
        preRegistrationContractAddress = _preRegistrationContractAddress;
    }

    function createEvent(
        string memory _eventName,
        string memory _artist,
        string memory _venue,
        uint256 _eventStartTime,
        uint256 _eventEndTime,
        address _creator,
        string memory _country,
        string memory _city,
        uint256 _maxPurchaseQuantityPerBuyer,
        uint256 _resaleProfitCapPercentage // Added
    ) public onlyOwner {
        Ticket newTicketContract = new Ticket(_eventName, _artist, _venue, _eventStartTime, _eventEndTime, address(this), _creator);
        eventContracts[eventCount] = address(newTicketContract);
        isEventCreator[address(newTicketContract)][_creator] = true;
        PreRegistration preRegistration = PreRegistration(preRegistrationContractAddress);
        preRegistration.setMaxPurchaseQuantity(address(newTicketContract), _maxPurchaseQuantityPerBuyer);
        preRegistration.setResaleProfitCapPercentage(address(newTicketContract), _resaleProfitCapPercentage); // Set resale profit cap
        emit EventCreated(eventCount, address(newTicketContract), _eventName, _creator, _country, _city, _maxPurchaseQuantityPerBuyer, _resaleProfitCapPercentage);
        eventCount++;
    }

    function createTickets(
        address _eventContractAddress,
        string memory _category,
        uint256 _price,
        uint256 _numTickets,
        bool _isFixedSeating,
        string[] memory _seatNumbers
    ) public onlyEventCreator(_eventContractAddress) {
        Ticket eventContract = Ticket(_eventContractAddress);
        PreRegistration preRegistration = PreRegistration(preRegistrationContractAddress);
        for (uint256 i = 0; i < _numTickets; i++) {
            string memory seatNumber = "";
            if (_isFixedSeating && i < _seatNumbers.length) {
                seatNumber = _seatNumbers[i];
            }
            eventContract.mint(msg.sender, _category, _price, seatNumber);
        }
        preRegistration.recordMintedTickets(_eventContractAddress, _category, _numTickets);
        emit TicketsCreated(_eventContractAddress, _category, _numTickets);
    }

    function setApprovalForMarketplace(address _eventContractAddress, address _marketplaceContract, bool _approved) public onlyEventCreator(_eventContractAddress) {
        marketplaceApproval[_eventContractAddress][_marketplaceContract] = _approved;
        Ticket eventContract = Ticket(_eventContractAddress);
        eventContract.setApprovalForAll(_marketplaceContract, _approved);
        emit MarketplaceApprovalSet(_eventContractAddress, _marketplaceContract, _approved);
    }

    modifier onlyEventCreator(address _eventContractAddress) {
        require(isEventCreator[_eventContractAddress][msg.sender], "Only the event creator can call this function.");
        _;
    }
}