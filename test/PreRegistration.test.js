const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PreRegistration", function () {
  let PreRegistration, preRegistration, TicketFactory, ticketFactory, Ticket, owner, buyer1, buyer2, buyer3, eventCreator;
  let eventAddress;
  const maxPurchasePerBuyer = 2;
  const resaleProfitCap = 50; // 50% profit cap

  beforeEach(async function () {
    [owner, buyer1, buyer2, buyer3, eventCreator] = await ethers.getSigners();

    PreRegistration = await ethers.getContractFactory("PreRegistration");
    preRegistration = await PreRegistration.deploy();

    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration);
    
    await preRegistration.updateTicketFactoryAddress(ticketFactory);

    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Math.trunc(Date.now() / 1000 + 86400), // Tomorrow
      Math.trunc(Date.now() / 1000 + 90000),
      eventCreator,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    eventAddress = await ticketFactory.eventContracts(0);
    await ticketFactory.connect(eventCreator).createTickets(eventAddress, "VIP", ethers.parseEther("1"), 3, true, ["A1", "A2", "A3"]);
    await ticketFactory.connect(eventCreator).setApprovalForPreRegistration(eventAddress, true);
    Ticket = await ethers.getContractAt("Ticket", eventAddress);
    await preRegistration.connect(owner).setPurchaseSlotDuration(3600); // 1 hour
    await preRegistration.connect(owner).setBufferBetweenSlots(1800); // 30 minutes
    await preRegistration.connect(owner).setPointsPerTicket(5);
  });

  async function registerAndPay(buyer, amount) {
    await preRegistration.connect(buyer).registerAndDepositForEvent(eventAddress, { value: amount });
  }

  it("Should allow users to register and deposit payment", async function () {
    await registerAndPay(buyer1, ethers.parseEther("1"));
    expect(await preRegistration.isRegistered(eventAddress, buyer1.address)).to.equal(true);
    expect(await preRegistration.payments(eventAddress, buyer1.address)).to.equal(ethers.parseEther("1"));
    const paidRegistrants = await preRegistration.getPaidRegistrants(eventAddress);
    expect(paidRegistrants).to.deep.equal([buyer1.address]);
  });

  it("Should allow users to deposit more payment", async function () {
    await registerAndPay(buyer1, ethers.parseEther("1"));
    await registerAndPay(buyer1, ethers.parseEther("1"));
    expect(await preRegistration.payments(eventAddress, buyer1.address)).to.equal(ethers.parseEther("2"));
  });

  it("Should allow the owner to start the ballot and allocate purchase slots", async function () {
    await registerAndPay(buyer1, ethers.parseEther("1"));
    await registerAndPay(buyer2, ethers.parseEther("1"));
    await registerAndPay(buyer3, ethers.parseEther("1"));

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

  it("Should allow users to purchase multiple tickets within the event limit and allocated slot, recording original prices", async function () {
    await registerAndPay(buyer1, ethers.parseEther("2")); // Paying for two tickets
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0, 1];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds))
      .to.emit(preRegistration, "TicketPurchased")
      .withArgs(eventAddress, buyer1.address, tokenIds);

    expect(await Ticket.ownerOf(tokenIds[0])).to.equal(buyer1.address);
    expect(await Ticket.ownerOf(tokenIds[1])).to.equal(buyer1.address);
    expect(await preRegistration.hasPurchased(eventAddress, buyer1.address)).to.equal(true);
    expect(await preRegistration.getOriginalPurchasePrice(eventAddress, tokenIds[0])).to.equal(ethers.parseEther("1"));
    expect(await preRegistration.getOriginalPurchasePrice(eventAddress, tokenIds[1])).to.equal(ethers.parseEther("1"));
  });

  it("Should return the list of available tickets for the given category", async function () {
    await registerAndPay(buyer1, ethers.parseEther("1"));
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [1];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");

    await preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds);

    expect(await preRegistration.connect(buyer2).getAvailableTicketsByCategory(eventAddress, "VIP")).deep.equal([0n, 2n]);
  });

  it("Should allow users to get list of available tickets according to category", async function () {
    await registerAndPay(buyer1, ethers.parseEther("2")); // Paying for two tickets
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0, 1];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds))
      .to.emit(preRegistration, "TicketPurchased")
      .withArgs(eventAddress, buyer1.address, tokenIds);

    expect(await Ticket.ownerOf(tokenIds[0])).to.equal(buyer1.address);
    expect(await Ticket.ownerOf(tokenIds[1])).to.equal(buyer1.address);
    expect(await preRegistration.hasPurchased(eventAddress, buyer1.address)).to.equal(true);
    expect(await preRegistration.getOriginalPurchasePrice(eventAddress, tokenIds[0])).to.equal(ethers.parseEther("1"));
    expect(await preRegistration.getOriginalPurchasePrice(eventAddress, tokenIds[1])).to.equal(ethers.parseEther("1"));
  });

  it("Should prevent purchasing more tickets than the amount deposited", async function () {
    await registerAndPay(buyer1, ethers.parseEther("1"));
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0, 1];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds)).to.be.revertedWith(
      "Insufficient payment."
    );
  });

  it("Should prevent top up or registration after Balloting started", async function () {
    await registerAndPay(buyer1, ethers.parseEther("1")); 
    await preRegistration.connect(owner).startBallot(eventAddress);
    await expect(registerAndPay(buyer1, ethers.parseEther("1"))).to.be.revertedWith(
      "Ballot has already started for this event."
    );
  });

  it("Should prevent buying outside of allocated slot", async function () {
    await registerAndPay(buyer1, ethers.parseEther("1"));
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0, 1];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) - 60]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds)).to.be.revertedWith(
      "Purchase window not active."
    );
  });

  it("Should refund the remaining money after the sales", async function () {
    const initialBuyer1Balance = await ethers.provider.getBalance(buyer1);
    const initialBuyer2Balance = await ethers.provider.getBalance(buyer2);

    await registerAndPay(buyer1, ethers.parseEther("2")); // Paying for two tickets
    await registerAndPay(buyer2, ethers.parseEther("1")); // Paying for one ticket
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer1.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");

    await preRegistration.connect(buyer1).purchaseTicket(eventAddress, tokenIds);

    await preRegistration.refundUnusedPayment(eventAddress)
    const finalBuyer1Balance = await ethers.provider.getBalance(buyer1);
    const finalBuyer2Balance = await ethers.provider.getBalance(buyer2);
    expect(finalBuyer1Balance).to.be.closeTo(initialBuyer1Balance - ethers.parseEther("1"), ethers.parseEther("0.01"));
    expect(finalBuyer2Balance).to.be.closeTo(initialBuyer2Balance, ethers.parseEther("0.01"));

  });



  it("Should set the resale profit cap percentage when creating event", async function () {
    expect(await preRegistration.getResaleProfitCapPercentage(eventAddress)).to.equal(resaleProfitCap);
  });
});