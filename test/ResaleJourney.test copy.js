const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ResaleJourney", function () {
  let TicketFactory, ticketFactory, ticketContract, eventCreator, loyaltyProgram, preRegistration, eventAddress, Marketplace, marketplace;
  const maxPurchasePerBuyer = 4;
  const resaleProfitCap = 50; // 50% profit cap

  before(async function () {
    [owner, eventCreator, seller, buyer] = await ethers.getSigners();
    PreRegistration = await ethers.getContractFactory("PreRegistration");
    preRegistration = await PreRegistration.deploy();

    LoyaltyProgram = await ethers.getContractFactory("LoyaltyProgram");
    loyaltyProgram = await LoyaltyProgram.deploy();

    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration);

    Marketplace = await ethers.getContractFactory("TicketMarketplace");
    marketplace = await Marketplace.connect(owner).deploy(preRegistration);

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
    ticketContract = await ethers.getContractAt("Ticket", eventAddress);
    await preRegistration.connect(seller).registerAndDepositForEvent(eventAddress, { value: ethers.parseEther("1") });
    await preRegistration.startBallot(eventAddress);
    
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, seller);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");

    const tokenIds = [0];

    await expect(preRegistration.connect(seller).purchaseTicket(eventAddress, tokenIds))
    await marketplace.setMarketplaceFeePercentage(1); // Set marketplace fee to 1%
  });

  it("Seller approve marketplace", async function () {
    await ticketContract.connect(seller).approve(marketplace, 0);
  });

  it("Seller list on marketplace within limit", async function () {
    await marketplace.connect(seller).listItem(ticketContract, 0, ethers.parseEther("1.4"));
    const listing = await marketplace.listings(ticketContract, 0);
    expect(listing.seller).to.equal(seller);
    expect(listing.price).to.equal(ethers.parseEther("1.4"));
  });

  it("Buyer purchase from marketplace", async function () {
    await marketplace.connect(buyer).buyTicket(ticketContract, 0, { value: ethers.parseEther("1.4") });
    const listing = await marketplace.listings(ticketContract, 0);
    expect(await ticketContract.ownerOf(0)).to.equal(buyer);
  });

  it("Owner of ticket will get loyalty point once ticket is used", async function () {
    await ticketFactory.connect(eventCreator).useTicket(eventAddress, 0);
    expect(await loyaltyProgram.getUserPoints(buyer)).to.equal(1); // Assuming 1 points per ticket
  });
});