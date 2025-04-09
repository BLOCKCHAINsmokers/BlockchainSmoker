// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Ticket is ERC721 {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    string public eventName;
    string public artist;
    string public venue;
    uint256 public eventStartTime;
    uint256 public eventEndTime;
    address public factoryAddress;
    address public eventCreator;

    mapping(uint256 => string) public category;
    mapping(uint256 => uint256) public price;
    mapping(uint256 => string) public seatNumber;
    mapping(uint256 => bool) public isUsed;
    // Removed maxPurchaseQuantity

    event TicketMinted(uint256 tokenId, address owner, string category, uint256 price, string seatNumber);
    event TicketUsed(uint256 tokenId);

    constructor(
        string memory _eventName,
        string memory _artist,
        string memory _venue,
        uint256 _eventStartTime,
        uint256 _eventEndTime,
        address _factoryAddress,
        address _eventCreator
    ) ERC721(_eventName, "TKT") {
        eventName = _eventName;
        artist = _artist;
        venue = _venue;
        eventStartTime = _eventStartTime;
        eventEndTime = _eventEndTime;
        factoryAddress = _factoryAddress;
        eventCreator = _eventCreator;
    }

    function mint(
        address _to,
        string memory _category,
        uint256 _price,
        string memory _seatNumber
        // Removed maxQuantity parameter
    ) public onlyFactory {
        uint256 tokenId = _tokenIdCounter.current();
        _mint(_to, tokenId);
        category[tokenId] = _category;
        price[tokenId] = _price;
        seatNumber[tokenId] = _seatNumber;
        emit TicketMinted(tokenId, _to, _category, _price, _seatNumber);
        _tokenIdCounter.increment();
    }

    function markAsUsed(uint256 _tokenId) public onlyFactory {
        require(ownerOf(_tokenId) != address(0), "Ticket does not exist.");
        require(!isUsed[_tokenId], "Ticket has already been used.");
        isUsed[_tokenId] = true;
        emit TicketUsed(uint256 tokenId);
    }

    // Removed getMaxPurchaseQuantity

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        // Add any logic before transfer if needed (e.g., time lock)
    }

    modifier onlyFactory() {
        require(msg.sender == factoryAddress, "Only the ticket factory can call this function.");
        _;
    }
}