// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract Ticket is ERC721 {
    uint256 private _tokenIdCounter;

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
        uint256 tokenId = _tokenIdCounter;
        _mint(_to, tokenId);
        category[tokenId] = _category;
        price[tokenId] = _price;
        seatNumber[tokenId] = _seatNumber;
        emit TicketMinted(tokenId, _to, _category, _price, _seatNumber);
        _tokenIdCounter += 1;
    }

    function markAsUsed(uint256 _tokenId) public onlyFactory {
        require(_tokenId < _tokenIdCounter, "Ticket does not exist.");
        require(!isUsed[_tokenId], "Ticket has already been used.");
        isUsed[_tokenId] = true;
        emit TicketUsed(_tokenId);
    }

    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }

    modifier onlyFactory() {
        require(msg.sender == factoryAddress, "Only the ticket factory can call this function.");
        _;
    }
}