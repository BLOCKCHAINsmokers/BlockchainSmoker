const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketFactory", function () {
  let TicketFactory, ticketFactory, owner, eventCreator, loyaltyProgram, preRegistration;
  const maxPurchasePerBuyer = 4;
  const resaleProfitCap = 50; // 50% profit cap

  beforeEach(async function () {
    [owner, eventCreator] = await ethers.getSigners();
    PreRegistration = await ethers.getContractFactory("PreRegistration");
    preRegistration = await PreRegistration.deploy();

    LoyaltyProgram = await ethers.getContractFactory("LoyaltyProgram");
    loyaltyProgram = await LoyaltyProgram.deploy();

    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration);

    await preRegistration.updateTicketFactoryAddress(ticketFactory);
    await loyaltyProgram.updateTicketFactoryAddress(ticketFactory);
    await ticketFactory.updateLoyaltyProgramAddress(loyaltyProgram);
  });

  it("Should allow the owner to create a new event with max purchase quantity per buyer and resale profit cap", async function () {
    await expect(
      ticketFactory.createEvent(
        "My Concert",
        "Artist Name",
        "Venue Name",
        Math.trunc(Date.now() / 1000 + 3600),
        Math.trunc(Date.now() / 1000 + 7200),
        eventCreator,
        "Singapore",
        "Singapore",
        maxPurchasePerBuyer,
        resaleProfitCap
      )
    ).to.emit(ticketFactory, "EventCreated");
    expect(await ticketFactory.eventCount()).to.equal(1);
    expect(await preRegistration.getMaxPurchaseQuantityPerBuyer(await ticketFactory.eventContracts(0))).to.equal(maxPurchasePerBuyer);
    expect(await preRegistration.getResaleProfitCapPercentage(await ticketFactory.eventContracts(0))).to.equal(resaleProfitCap);
  });

  it("Should allow the event creator to create tickets for their event", async function () {
    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Math.trunc(Date.now() / 1000 + 3600),
      Math.trunc(Date.now() / 1000 + 7200),
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);
    const initialSupply = await ethers.getContractAt("Ticket", eventAddress);
    expect(await initialSupply.totalSupply()).to.equal(0);

    await ticketFactory.connect(eventCreator).createTickets(eventAddress, "VIP", ethers.parseEther("1"), 5, true, ["A1", "A2", "A3", "A4", "A5"]);
    const finalSupply = await ethers.getContractAt("Ticket", eventAddress);
    expect(await finalSupply.totalSupply()).to.equal(5);
  });

  it("Should allow the event creator to set approval for the preregistration", async function () {
    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Math.trunc(Date.now() / 1000 + 3600),
      Math.trunc(Date.now() / 1000 + 7200),
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);

    await expect(ticketFactory.connect(eventCreator).setApprovalForPreRegistration(eventAddress, true))
      .to.emit(ticketFactory, "PreRegistrationApprovalSet")
      .withArgs(eventAddress, preRegistration, true);

    const ticketContract = await ethers.getContractAt("Ticket", eventAddress);
    expect(await ticketContract.isApprovedForAll(ticketFactory, preRegistration)).to.equal(true);
  });

  it("Should prevent non-event creators from creating tickets", async function () {
    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Math.trunc(Date.now() / 1000 + 3600),
      Math.trunc(Date.now() / 1000 + 7200),
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);
    await expect(
      ticketFactory.connect(owner).createTickets(eventAddress, "General", ethers.parseEther("0.5"), 10, false, [])
    ).to.be.revertedWith("Only the event creator can call this function.");
  });

  it("Should allow the ticketFactory to mark ticket as used and update loyaltyProgram", async function () {
    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Math.trunc(Date.now() / 1000 + 3600),
      Math.trunc(Date.now() / 1000 + 7200),
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);
    await ticketFactory.connect(eventCreator).createTickets(eventAddress, "VIP", ethers.parseEther("1"), 5, true, ["A1", "A2", "A3", "A4", "A5"]);
    await ticketFactory.connect(eventCreator).useTicket(eventAddress, 0);
    expect(await loyaltyProgram.getUserPoints(ticketFactory)).to.equal(1); // Assuming 1 points per ticket
  });
});