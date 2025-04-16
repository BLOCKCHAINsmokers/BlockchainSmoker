// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract LoyaltyProgram is Ownable {
    mapping(address => uint256) public userPoints;
    address public ticketFactoryAddress;

    event PointsAdded(address indexed user, uint256 points);
    event PointsDeducted(address indexed user, uint256 points);
    event RewardRedeemed(address indexed user, uint256 rewardId);

    constructor() Ownable(msg.sender) {
    }

    function updateTicketFactoryAddress(address _newAddress) public onlyOwner {
        require(_newAddress != address(0), "Address cannot be zero.");
        ticketFactoryAddress = _newAddress;
    }

    function addPoints(address _user, uint256 _points) public onlyTicketFactory() {
        userPoints[_user] += _points;
        emit PointsAdded(_user, _points);
    }

    function getUserPoints(address _user) public view returns (uint256) {
        return userPoints[_user];
    }

    function redeemRewards(address _user, uint256 _rewardId) public onlyOwner {
        // Implement reward redemption logic here
        // This could involve checking point balances and triggering actions
        emit RewardRedeemed(_user, _rewardId);
    }

    modifier onlyTicketFactory() {
        require(msg.sender == ticketFactoryAddress, "Caller is not the TicketFactory contract.");
        _;
    }
}