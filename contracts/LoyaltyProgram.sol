// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract LoyaltyProgram is Ownable {
    struct Reward {
        uint256 id;
        string name;
        uint256 pointCost;
        uint256 availableQuantity;
        bool isActive;
    }

    mapping(address => uint256) public userPoints;
    mapping(uint256 => Reward) public rewards;
    uint256 public rewardCount;
    address public ticketFactoryAddress;
    address public eventVerifierAddress;

    event PointsAdded(address indexed user, uint256 points);
    event PointsDeducted(address indexed user, uint256 points);
    event RewardAdded(uint256 indexed rewardId, string name, uint256 pointCost);
    event RewardRedeemed(address indexed user, uint256 rewardId);
    event RewardStatusChanged(uint256 indexed rewardId, bool isActive);

    constructor() Ownable(msg.sender) {}

    function updateTicketFactoryAddress(address _newAddress) public onlyOwner {
        require(_newAddress != address(0), "Address cannot be zero.");
        ticketFactoryAddress = _newAddress;
    }

    function updateEventVerifierAddress(address _newAddress) public onlyOwner {
        require(_newAddress != address(0), "Address cannot be zero.");
        eventVerifierAddress = _newAddress;
    }

    function addPoints(address _user, uint256 _points) public onlyAuthorized {
        userPoints[_user] += _points;
        emit PointsAdded(_user, _points);
    }

    function deductPoints(address _user, uint256 _points) public onlyAuthorized {
        require(userPoints[_user] >= _points, "Insufficient points");
        userPoints[_user] -= _points;
        emit PointsDeducted(_user, _points);
    }

    function addReward(string memory _name, uint256 _pointCost, uint256 _quantity) public onlyOwner {
        rewards[rewardCount] = Reward({
            id: rewardCount,
            name: _name,
            pointCost: _pointCost,
            availableQuantity: _quantity,
            isActive: true
        });
        emit RewardAdded(rewardCount, _name, _pointCost);
        rewardCount++;
    }

    function toggleRewardStatus(uint256 _rewardId, bool _isActive) public onlyOwner {
        rewards[_rewardId].isActive = _isActive;
        emit RewardStatusChanged(_rewardId, _isActive);
    }

    function redeemReward(address _user, uint256 _rewardId) public onlyAuthorized {
        Reward storage reward = rewards[_rewardId];
        require(reward.isActive, "Reward is not available");
        require(reward.availableQuantity > 0, "Reward out of stock");
        require(userPoints[_user] >= reward.pointCost, "Not enough points");

        userPoints[_user] -= reward.pointCost;
        reward.availableQuantity--;
        emit RewardRedeemed(_user, _rewardId);
    }

    function getUserPoints(address _user) public view returns (uint256) {
        return userPoints[_user];
    }

    function getRewardInfo(uint256 _rewardId) public view returns (Reward memory) {
        return rewards[_rewardId];
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == ticketFactoryAddress || 
            msg.sender == eventVerifierAddress || 
            msg.sender == owner(),
            "Caller is not authorized"
        );
        _;
    }
}