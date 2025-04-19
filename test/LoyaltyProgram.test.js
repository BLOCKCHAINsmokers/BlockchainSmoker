const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LoyaltyProgram", function () {
  let LoyaltyProgram, loyaltyProgram, owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2, ticketFactory] = await ethers.getSigners();
    LoyaltyProgram = await ethers.getContractFactory("LoyaltyProgram");
    loyaltyProgram = await LoyaltyProgram.deploy();
    await loyaltyProgram.updateTicketFactoryAddress(ticketFactory);
  });

  it("Should allow the ticketFactory to add points to a user", async function () {
    await expect(loyaltyProgram.connect(ticketFactory).addPoints(user1.address, 100))
      .to.emit(loyaltyProgram, "PointsAdded")
      .withArgs(user1.address, 100);
    expect(await loyaltyProgram.getUserPoints(user1.address)).to.equal(100);
  });

  it("Should anyone to get a user's point balance", async function () {
    await loyaltyProgram.connect(ticketFactory).addPoints(user2.address, 250);
    expect(await loyaltyProgram.connect(user1).getUserPoints(user2.address)).to.equal(250);
  });

  it("Should allow the owner to trigger a reward redemption (basic check)", async function () {
    await loyaltyProgram.connect(ticketFactory).addPoints(user1.address, 1000);
    await loyaltyProgram.addReward("Free Drink", 1, 1000);
    await expect(loyaltyProgram.redeemReward(user1.address, 0))
      .to.emit(loyaltyProgram, "RewardRedeemed")
      .withArgs(user1.address, 0);
    // Add more specific logic for reward redemption in the contract and tests
  });
});