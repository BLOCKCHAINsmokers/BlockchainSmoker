const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketFactory", function () {
  let TicketFactory, ticketFactory, owner, eventCreator, marketplace, preRegistration;
  const maxPurchasePerBuyer = 4;
  const resaleProfitCap = 50; // 50% profit cap

  beforeEach(async function () {
    [owner, eventCreator, marketplace, preRegistration] = await ethers.getSigners();
    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration.address);
    await ticketFactory.deployed();
  });

  it("Should allow the owner to create a new event with max purchase quantity per buyer and resale profit cap", async function () {
    await expect(
      ticketFactory.createEvent(
        "My Concert",
        "Artist Name",
        "Venue Name",
        Date.now() / 1000 + 3600,
        Date.now() / 1000 + 7200,
        eventCreator.address,
        "Singapore",
        "Singapore",
        maxPurchasePerBuyer,
        resaleProfitCap
      )
    )
      .to.emit(ticketFactory, "EventCreated")
      .withArgs(0, ethers.constants.AddressZero, "My Concert", eventCreator.address, "Singapore", "Singapore", maxPurchasePerBuyer, resaleProfitCap);
    expect(await ticketFactory.eventCount()).to.equal(1);
    expect(await preRegistration.getMaxPurchaseQuantityPerBuyer(await ticketFactory.eventContracts(0))).to.equal(maxPurchasePerBuyer);
    expect(await preRegistration.getResaleProfitCapPercentage(await ticketFactory.eventContracts(0))).to.equal(resaleProfitCap);
  });

  it("Should allow the event creator to create tickets for their event", async function () {
    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Date.now() / 1000 + 3600,
      Date.now() / 1000 + 7200,
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);
    const initialSupply = await ethers.getContractAt("Ticket", eventAddress);
    expect(await initialSupply.totalSupply()).to.equal(0);

    await ticketFactory.connect(eventCreator).createTickets(eventAddress, "VIP", ethers.utils.parseEther("1"), 5, true, ["A1", "A2", "A3", "A4", "A5"]);
    const finalSupply = await ethers.getContractAt("Ticket", eventAddress);
    expect(await finalSupply.totalSupply()).to.equal(5);
  });

  it("Should allow the event creator to set approval for the marketplace", async function () {
    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Date.now() / 1000 + 3600,
      Date.now() / 1000 + 7200,
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);

    await expect(ticketFactory.connect(eventCreator).setApprovalForMarketplace(eventAddress, marketplace.address, true))
      .to.emit(ticketFactory, "MarketplaceApprovalSet")
      .withArgs(eventAddress, marketplace.address, true);

    const ticketContract = await ethers.getContractAt("Ticket", eventAddress);
    expect(await ticketContract.isApprovedForAll(eventCreator.address, marketplace.address)).to.equal(true);
  });

  it("Should prevent non-event creators from creating tickets", async function () {
    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Date.now() / 1000 + 3600,
      Date.now() / 1000 + 7200,
      eventCreator.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);
    await expect(
      ticketFactory.connect(owner).createTickets(eventAddress, "General", ethers.utils.parseEther("0.5"), 10, false, [])
    ).to.be.revertedWith("Only the event creator can call this function.");
  });
});