// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract LoyaltyProgram is Ownable {
    mapping(address => uint256) public userPoints;

    event PointsAdded(address indexed user, uint256 points);
    event PointsDeducted(address indexed user, uint256 points);
    event RewardRedeemed(address indexed user, uint256 rewardId);

    function addPoints(address _user, uint256 _points) public onlyOwner {
        userPoints[_user] += _points;
        emit PointsAdded(_user, _points);
    }

    function deductPoints(address _user, uint256 _points) public onlyOwner {
        require(userPoints[_user] >= _points, "Insufficient points.");
        userPoints[_user] -= _points;
        emit PointsDeducted(_user, _points);
    }

    function getUserPoints(address _user) public view returns (uint256) {
        return userPoints[_user];
    }

    function redeemRewards(address _user, uint256 _rewardId) public onlyOwner {
        // Implement reward redemption logic here
        // This could involve checking point balances and triggering actions
        emit RewardRedeemed(_user, _rewardId);
    }
}