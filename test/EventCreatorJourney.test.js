const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EventCreatorJourney", function () {
  let TicketFactory, ticketFactory, owner, eventCreator, loyaltyProgram, preRegistration, eventAddress;
  const maxPurchasePerBuyer = 4;
  const resaleProfitCap = 50; // 50% profit cap

  before(async function () {
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

  it("Create event by ticketFactory Owner", async function () {
    await expect(
      ticketFactory.createEvent(
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
      )
    ).to.emit(ticketFactory, "EventCreated");
    eventAddress = await ticketFactory.eventContracts(0);
  });

  it("Create tickets by eventCreator", async function () {
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
  });
  it("Set Approval for PreRegistration", async function () {
    await ticketFactory.connect(eventCreator).setApprovalForPreRegistration(eventAddress, true);
    const ticketContract = await ethers.getContractAt("Ticket", eventAddress);
    expect(await ticketContract.isApprovedForAll(ticketFactory, preRegistration)).to.equal(true);
  });
});