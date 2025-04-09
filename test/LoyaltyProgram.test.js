const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LoyaltyProgram", function () {
  let LoyaltyProgram, loyaltyProgram, owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    LoyaltyProgram = await ethers.getContractFactory("LoyaltyProgram");
    loyaltyProgram = await LoyaltyProgram.deploy();
    await loyaltyProgram.deployed();
  });

  it("Should allow the owner to add points to a user", async function () {
    await expect(loyaltyProgram.connect(owner).addPoints(user1.address, 100))
      .to.emit(loyaltyProgram, "PointsAdded")
      .withArgs(user1.address, 100);
    expect(await loyaltyProgram.getUserPoints(user1.address)).to.equal(100);
  });

  it("Should allow the owner to deduct points from a user", async function () {
    await loyaltyProgram.connect(owner).addPoints(user1.address, 100);
    await expect(loyaltyProgram.connect(owner).deductPoints(user1.address, 50))
      .to.emit(loyaltyProgram, "PointsDeducted")
      .withArgs(user1.address, 50);
    expect(await loyaltyProgram.getUserPoints(user1.address)).to.equal(50);
  });

  it("Should prevent deducting more points than a user has", async function () {
    await loyaltyProgram.connect(owner).addPoints(user1.address, 100);
    await expect(loyaltyProgram.connect(owner).deductPoints(user1.address, 150)).to.be.revertedWith("Insufficient points.");
  });

  it("Should allow the owner to get a user's point balance", async function () {
    await loyaltyProgram.connect(owner).addPoints(user2.address, 250);
    expect(await loyaltyProgram.getUserPoints(user2.address)).to.equal(250);
  });

  it("Should allow the owner to trigger a reward redemption (basic check)", async function () {
    await loyaltyProgram.connect(owner).addPoints(user1.address, 1000);
    await expect(loyaltyProgram.connect(owner).redeemRewards(user1.address, 1))
      .to.emit(loyaltyProgram, "RewardRedeemed")
      .withArgs(user1.address, 1);
    // Add more specific logic for reward redemption in the contract and tests
  });
});