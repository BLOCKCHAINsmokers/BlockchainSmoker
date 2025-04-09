const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PreRegistration", function () {
  let PreRegistration, preRegistration, TicketFactory, ticketFactory, Ticket, LoyaltyProgram, loyaltyProgram, owner, buyer1, buyer2, buyer3, eventCreator;
  let eventAddress;
  const maxPurchasePerBuyer = 2;
  const resaleProfitCap = 50; // 50% profit cap

  beforeEach(async function () {
    [owner, buyer1, buyer2, buyer3, eventCreator] = await ethers.getSigners();

    LoyaltyProgram = await ethers.getContractFactory("LoyaltyProgram");
    loyaltyProgram = await LoyaltyProgram.deploy();
    await loyaltyProgram.deployed();

    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration.address);
    await ticketFactory.deployed();

    PreRegistration = await ethers.getContractFactory("PreRegistration");
    preRegistration = await PreRegistration.deploy(loyaltyProgram.address);
    await preRegistration.deployed();

    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Date.now() / 1000 + 86400, // Tomorrow
      Date.now() / 1000 + 90000,
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    eventAddress = await ticketFactory.eventContracts(0);
    await ticketFactory.connect(eventCreator).createTickets(eventAddress, "VIP", ethers.utils.parseEther("1"), 3, true, ["A1", "A2", "A3"]);
    Ticket = await ethers.getContractAt("Ticket", eventAddress);
    await preRegistration.connect(owner).setTicketPrice(eventAddress, 0, ethers.utils.parseEther("1"));
    await preRegistration.connect(owner).setAvailableTickets(eventAddress, 0, 3);
    await preRegistration.connect(owner).setPurchaseSlotDuration(3600); // 1 hour
    await preRegistration.connect(owner).setBufferBetweenSlots(1800); // 30 minutes
    await preRegistration.connect(owner).setPointsPerTicket(5);
  });

  async function registerAndPay(buyer, amount) {
    await preRegistration.connect(buyer).registerForEvent(eventAddress);
    await preRegistration.connect(buyer).depositPayment(eventAddress, { value: amount });
  }

  it("Should allow users to register and deposit payment", async function () {
    await registerAndPay(buyer1, ethers.utils.parseEther("1"));
    expect(await preRegistration.isRegistered(eventAddress, buyer1.address)).to.equal(true);
    expect(await preRegistration.payments(eventAddress, buyer1.address)).to.equal(ethers.utils.parseEther("1"));
    const paidRegistrants = await preRegistration.getPaidRegistrants(eventAddress);
    expect(paidRegistrants).to.deep.equal([buyer1.address]);
  });

  it("Should allow the owner to start the ballot and allocate purchase slots", async function () {
    await registerAndPay(buyer1, ethers.utils.parseEther("1"));
    await registerAndPay(buyer2, ethers.utils.parseEther("1"));
    await registerAndPay(buyer3, ethers.utils.parseEther("1"));

    await expect(preRegistration.connect(owner).startBallot(eventAddress))
      .to.emit(preRegistration, "BallotStarted")
      .withArgs(eventAddress);

    expect(await preRegistration.purchaseSlotStart(eventAddress, buyer1.address)).to.be.above(0);
    expect(await preRegistration.purchaseSlotEnd(eventAddress, buyer1.address)).to.be.above(0);
    expect(await preRegistration.purchaseSlotStart(eventAddress, buyer2.address)).to.be.above(0);
    expect(await preRegistration.purchaseSlotEnd(eventAddress, buyer2.address)).to.be.above(0);
    expect(await preRegistration.purchaseSlotStart(eventAddress, buyer3.address)).to.be.above(0);
    expect(await preRegistration.purchaseSlotEnd(eventAddress, buyer3.address)).to.be.above(0);
  });

  it("Should allow users to purchase single ticket within their allocated slot and award loyalty points, recording original price", async function () {
    await registerAndPay(buyer1, ethers.utils.parseEther("1"));
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenId = 0;
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime.add(60)]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer1).purchaseTicket(eventAddress, [tokenId]))
      .to.emit(preRegistration, "TicketPurchased")
      .withArgs(eventAddress, buyer1.address, [tokenId]);

    expect(await Ticket.ownerOf(tokenId)).to.equal(buyer1.address);
    expect(await preRegistration.hasPurchased(eventAddress, buyer1.address)).to.equal(true);
    expect(await loyaltyProgram.getUserPoints(buyer1.address)).to.equal(5);
    expect(await preRegistration.getOriginalPurchasePrice(eventAddress, tokenId)).to.equal(ethers.utils.parseEther("1"));
  });

  it("Should allow users to purchase multiple tickets within the event limit and allocated slot, recording original prices", async function () {
    await registerAndPay(buyer1, ethers.utils.parseEther("2")); // Paying for two tickets
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0, 1];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime.add(60)]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds))
      .to.emit(preRegistration, "TicketPurchased")
      .withArgs(eventAddress, buyer1.address, tokenIds);

    expect(await Ticket.ownerOf(tokenIds[0])).to.equal(buyer1.address);
    expect(await Ticket.ownerOf(tokenIds[1])).to.equal(buyer1.address);
    expect(await preRegistration.hasPurchased(eventAddress, buyer1.address)).to.equal(true);
    expect(await loyaltyProgram.getUserPoints(buyer1.address)).to.equal(10);
    expect(await preRegistration.getOriginalPurchasePrice(eventAddress, tokenIds[0])).to.equal(ethers.utils.parseEther("1"));
    expect(await preRegistration.getOriginalPurchasePrice(eventAddress, tokenIds[1])).to.equal(ethers.utils.parseEther("1"));
  });

  it("Should prevent purchasing more tickets than the allowed limit per buyer for the event", async function () {
    await registerAndPay(buyer1, ethers.utils.parseEther("3")); // Trying to buy three tickets, limit is 2
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0, 1, 2];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime.add(60)]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds)).to.be.revertedWith(
      "Cannot purchase more than the allowed limit for this event."
    );
  });

  // ... (rest of the PreRegistration tests remain largely the same)

  it("Should emit an event when max purchase quantity is set", async function () {
    const quantity = 3;
    const tx = await preRegistration.connect(owner).setMaxPurchaseQuantity(eventAddress, quantity);
    await expect(tx).to.emit(preRegistration, "MaxPurchaseQuantitySet").withArgs(eventAddress, quantity);
    expect(await preRegistration.getMaxPurchaseQuantityPerBuyer(eventAddress)).to.equal(quantity);
  });

  it("Should allow the owner to set the resale profit cap percentage", async function () {
    const percentage = 75;
    const tx = await preRegistration.connect(owner).setResaleProfitCapPercentage(eventAddress, percentage);
    await expect(tx).to.emit(preRegistration, "ResaleProfitCapPercentageSet").withArgs(eventAddress, percentage);
    expect(await preRegistration.getResaleProfitCapPercentage(eventAddress)).to.equal(percentage);
  });
});