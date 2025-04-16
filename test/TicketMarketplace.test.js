const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketMarketplace", function () {
  let TicketFactory, ticketFactory, ticket, Marketplace, marketplace, owner, seller, buyer, preRegistration;
  const maxPurchasePerBuyer = 1;
  const resaleProfitCap = 50; // 50% profit cap

  beforeEach(async function () {
    [owner, seller, buyer, eventCreator] = await ethers.getSigners();

    PreRegistration = await ethers.getContractFactory("PreRegistration");
    preRegistration = await PreRegistration.deploy();

    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration);
    
    await preRegistration.updateTicketFactoryAddress(ticketFactory);
    
    await ticketFactory.createEvent(
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
    );
    const eventAddress = await ticketFactory.eventContracts(0);
    await ticketFactory.connect(eventCreator).createTickets(eventAddress, "General", ethers.parseEther("1"), 1, false, []);
    ticket = await ethers.getContractAt("Ticket", eventAddress);
    await ticketFactory.connect(eventCreator).setApprovalForPreRegistration(eventAddress, true);

    Marketplace = await ethers.getContractFactory("TicketMarketplace");
    marketplace = await Marketplace.deploy(preRegistration);

    // Simulate a purchase to record the original price in PreRegistration
    await preRegistration.connect(seller).registerAndDepositForEvent(eventAddress, { value: ethers.parseEther("1") });
    await preRegistration.connect(owner).startBallot(eventAddress);
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, seller);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 60]);
    await ethers.provider.send("evm_mine");
    await preRegistration.connect(seller).purchaseTicket(eventAddress, [0]);
  });

  it("Should allow a ticket owner to list their ticket for sale within the profit cap", async function () {
    const originalPrice = await preRegistration.getOriginalPurchasePrice(ticket, 0);
    const capPercentage = await preRegistration.getResaleProfitCapPercentage(ticket);
    const maxResalePrice = originalPrice + (originalPrice / BigInt(100)) * capPercentage;

    await ticket.connect(seller).approve(marketplace, 0);

    await expect(marketplace.connect(seller).listItem(ticket, 0, maxResalePrice))
      .to.emit(marketplace, "TicketListed")
      .withArgs(ticket, 0, seller, maxResalePrice);
    const listing = await marketplace.listings(ticket, 0);
    expect(listing.seller).to.equal(seller);
    expect(listing.price).to.equal(maxResalePrice);
  });

  it("Should prevent listing a ticket for sale above the profit cap", async function () {
    const originalPrice = await preRegistration.getOriginalPurchasePrice(ticket, 0);
    const capPercentage = await preRegistration.getResaleProfitCapPercentage(ticket);
    const maxResalePrice = originalPrice + (originalPrice / BigInt(100)) * capPercentage;
    const listingPrice = maxResalePrice + ethers.parseEther("0.1");

    await expect(marketplace.connect(seller).listItem(ticket, 0, listingPrice)).to.be.revertedWith(
      "Listing price exceeds the allowed profit cap."
    );
  });

  it("Should allow a buyer to purchase a listed ticket", async function () {
    await ticket.connect(seller).approve(marketplace, 0);
    await marketplace.connect(seller).listItem(ticket, 0, ethers.parseEther("1.5")); // Original price was 1 ETH, 50% cap allows up to 1.5 ETH
    const initialSellerBalance = await ethers.provider.getBalance(seller);

    await expect(marketplace.connect(buyer).buyTicket(ticket, 0, { value: ethers.parseEther("1.5") }))
      .to.emit(marketplace, "TicketBought")
      .withArgs(ticket, 0, buyer, seller, ethers.parseEther("1.5"));

    expect(await ticket.ownerOf(0)).to.equal(buyer);
    const finalSellerBalance = await ethers.provider.getBalance(seller);
    expect(finalSellerBalance).to.be.closeTo(initialSellerBalance + ethers.parseEther("1.5"), ethers.parseEther("0.01"));
    const listing = await marketplace.listings(ticket, 0);
    expect(listing.seller).to.equal(ethers.ZeroAddress);
  });

  it("Should allow a seller to delist their ticket", async function () {
    await marketplace.connect(seller).listItem(ticket, 0, ethers.parseEther("1.5"));
    await expect(marketplace.connect(seller).delistItem(ticket, 0))
      .to.emit(marketplace, "TicketDelisted")
      .withArgs(ticket, 0, seller);
    const listing = await marketplace.listings(ticket, 0);
    expect(listing.seller).to.equal(ethers.ZeroAddress);
  });

  it("Should allow the owner to set the marketplace fee percentage", async function () {
    await marketplace.connect(owner).setMarketplaceFeePercentage(5)
    expect(await marketplace.marketplaceFeePercentage()).to.equal(5);
  });
});