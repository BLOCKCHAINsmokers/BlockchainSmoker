const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BuyerJourney", function () {
  let TicketFactory, ticketFactory, owner, eventCreator, loyaltyProgram, preRegistration, eventAddress;
  const maxPurchasePerBuyer = 4;
  const resaleProfitCap = 50; // 50% profit cap

  before(async function () {
    [owner, eventCreator, buyer] = await ethers.getSigners();
    PreRegistration = await ethers.getContractFactory("PreRegistration");
    preRegistration = await PreRegistration.deploy();

    LoyaltyProgram = await ethers.getContractFactory("LoyaltyProgram");
    loyaltyProgram = await LoyaltyProgram.deploy();

    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration);

    await preRegistration.updateTicketFactoryAddress(ticketFactory);
    await loyaltyProgram.updateTicketFactoryAddress(ticketFactory);
    await ticketFactory.updateLoyaltyProgramAddress(loyaltyProgram);

    await ticketFactory.createEvent(
        "My Concert", // Event Name
        "Artist Name", //Artist Name
        "National Stadium", //Venue Name
        Math.trunc(Date.now() / 1000 + 3600), // Event Start Time
        Math.trunc(Date.now() / 1000 + 7200), // Event End Time
        eventCreator, // Event Creator Address
        "Singapore", // Country
        "Singapore", // City
        maxPurchasePerBuyer, // Ticket Purchase Limit
        resaleProfitCap // Resale Profit Cap
    );

    eventAddress = await ticketFactory.eventContracts(0);

    await ticketFactory.connect(eventCreator).createTickets(
      eventAddress, // Ticket Address
      "VIP", // Ticket Category
      ethers.parseEther("1"), // Ticket Price
      5, // Number of Tickets
      true, // Fixed Seating
      ["A1", "A2", "A3", "A4", "A5"] // Seat Numbers
    );

    await ticketFactory.connect(eventCreator).createTickets(
      eventAddress, // Ticket Address
      "CAT A", // Ticket Category
      ethers.parseEther("0.5"), // Ticket Price
      5, // Number of Tickets
      true, // Fixed Seating
      ["B1", "B2", "B3", "B4", "B5"] // Seat Numbers
    );
    await ticketFactory.connect(eventCreator).setApprovalForPreRegistration(eventAddress, true);
    const ticketContract = await ethers.getContractAt("Ticket", eventAddress);
  });

  it("Buyer to register and deposit payment before ballot start.", async function () {
    await preRegistration.connect(buyer).registerAndDepositForEvent(eventAddress, { value: ethers.parseEther("1") });
    expect(await preRegistration.isRegistered(eventAddress, buyer.address)).to.equal(true);
    expect(await preRegistration.payments(eventAddress, buyer.address)).to.equal(ethers.parseEther("1"));
  });

  it("Buyer can deposit more payment before ballot start", async function () {
    await preRegistration.connect(buyer).registerAndDepositForEvent(eventAddress, { value: ethers.parseEther("1") });
    expect(await preRegistration.payments(eventAddress, buyer.address)).to.equal(ethers.parseEther("2"));
  });

  it("Start of balloting: buyer assigned timeslot and buy multiple ticket within the maximum allowed.", async function () {
    await preRegistration.connect(owner).startBallot(eventAddress);

    const tokenIds = [0, 1];
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, buyer);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");

    await expect(preRegistration.connect(buyer).purchaseTicket(eventAddress, tokenIds))
      .to.emit(preRegistration, "TicketPurchased")
      .withArgs(eventAddress, buyer.address, tokenIds);

    Ticket = await ethers.getContractAt("Ticket", eventAddress);

    expect(await Ticket.ownerOf(tokenIds[0])).to.equal(buyer.address);
    expect(await Ticket.ownerOf(tokenIds[1])).to.equal(buyer.address);
    expect(await preRegistration.hasPurchased(eventAddress, buyer.address)).to.equal(true);
  });

  it("Buyer can also check for avaliable tickets", async function () {
    expect(await preRegistration.connect(buyer).getAvailableTicketsByCategory(eventAddress, "VIP")).deep.equal([2n, 3n, 4n]);
  });

  it("Owner of ticket will get loyalty point once ticket is used", async function () {
    await ticketFactory.connect(eventCreator).useTicket(eventAddress, 0);
    expect(await loyaltyProgram.getUserPoints(buyer)).to.equal(1); // Assuming 1 points per ticket
  });
});