const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketMarketplace", function () {
  let TicketFactory, ticketFactory, Ticket, ticket, Marketplace, marketplace, owner, seller, buyer, preRegistration;
  const maxPurchasePerBuyer = 1;
  const resaleProfitCap = 50; // 50% profit cap

  beforeEach(async function () {
    [owner, seller, buyer, preRegistration] = await ethers.getSigners();
    TicketFactory = await ethers.getContractFactory("TicketFactory");
    ticketFactory = await TicketFactory.deploy(preRegistration.address);
    await ticketFactory.deployed();

    await ticketFactory.createEvent(
      "My Concert",
      "Artist Name",
      "Venue Name",
      Date.now() / 1000 + 3600,
      Date.now() / 1000 + 7200,
      seller.address,
      "Singapore",
      "Singapore",
      maxPurchasePerBuyer,
      resaleProfitCap
    );
    const eventAddress = await ticketFactory.eventContracts(0);
    await ticketFactory.connect(seller).createTickets(eventAddress, "General", ethers.utils.parseEther("1"), 1, false, [], 1);
    Ticket = await ethers.getContractAt("Ticket", eventAddress);
    await ticket.connect(seller).approve(ticketFactory.address, 0); // Approve TicketFactory to transfer (initially owned by seller)

    Marketplace = await ethers.getContractFactory("TicketMarketplace");
    marketplace = await Marketplace.deploy(preRegistration.address);
    await marketplace.deployed();

    await ticketFactory.connect(seller).setApprovalForMarketplace(eventAddress, marketplace.address, true);

    // Simulate a purchase to record the original price in PreRegistration
    await preRegistration.connect(seller).registerForEvent(eventAddress);
    await preRegistration.connect(seller).depositPayment(eventAddress, { value: ethers.utils.parseEther("1") });
    await preRegistration.connect(owner).startBallot(eventAddress);
    const startTime = await preRegistration.purchaseSlotStart(eventAddress, seller.address);
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime.add(60)]);
    await ethers.provider.send("evm_mine");
    await preRegistration.connect(seller).purchaseTicket(eventAddress, [0]);
  });

  it("Should allow a ticket owner to list their ticket for sale within the profit cap", async function () {
    const originalPrice = await preRegistration.getOriginalPurchasePrice(ticket.address, 0);
    const capPercentage = await preRegistration.getResaleProfitCapPercentage(ticket.address);
    const maxResalePrice = originalPrice.add(originalPrice.mul(capPercentage).div(100));

    await expect(marketplace.connect(seller).listItem(ticket.address, 0, maxResalePrice))
      .to.emit(marketplace, "TicketListed")
      .withArgs(ticket.address, 0, seller.address, maxResalePrice);
    const listing = await marketplace.listings(ticket.address, 0);
    expect(listing.seller).to.equal(seller.address);
    expect(listing.price).to.equal(maxResalePrice);
  });

  it("Should prevent listing a ticket for sale above the profit cap", async function () {
    const originalPrice = await preRegistration.getOriginalPurchasePrice(ticket.address, 0);
    const capPercentage = await preRegistration.getResaleProfitCapPercentage(ticket.address);
    const maxResalePrice = originalPrice.add(originalPrice.mul(capPercentage).div(100));
    const listingPrice = maxResalePrice.add(ethers.utils.parseEther("0.1"));

    await expect(marketplace.connect(seller).listItem(ticket.address, 0, listingPrice)).to.be.revertedWith(
      "Listing price exceeds the allowed profit cap."
    );
  });

  it("Should allow a buyer to purchase a listed ticket", async function () {
    await marketplace.connect(seller).listItem(ticket.address, 0, ethers.utils.parseEther("1.5")); // Original price was 1 ETH, 50% cap allows up to 1.5 ETH
    const initialSellerBalance = await ethers.provider.getBalance(seller.address);

    await expect(marketplace.connect(buyer).buyTicket(ticket.address, 0, { value: ethers.utils.parseEther("1.5") }))
      .to.emit(marketplace, "TicketBought")
      .withArgs(ticket.address, 0, buyer.address, seller.address, ethers.utils.parseEther("1.5"));

    expect(await ticket.ownerOf(0)).to.equal(buyer.address);
    const finalSellerBalance = await ethers.provider.getBalance(seller.address);
    expect(finalSellerBalance).to.be.closeTo(initialSellerBalance.add(ethers.utils.parseEther("1.5")), ethers.utils.parseEther("0.01"));
    const listing = await marketplace.listings(ticket.address, 0);
    expect(listing.seller).to.equal(ethers.constants.AddressZero);
  });

  it("Should allow a seller to delist their ticket", async function () {
    await marketplace.connect(seller).listItem(ticket.address, 0, ethers.utils.parseEther("1.5"));
    await expect(marketplace.connect(seller).delistItem(ticket.address, 0))
      .to.emit(marketplace, "TicketDelisted")
      .withArgs(ticket.address, 0, seller.address);
    const listing = await marketplace.listings(ticket.address, 0);
    expect(listing.seller).to.equal(ethers.constants.AddressZero);
  });

  it("Should allow the owner to set the marketplace fee percentage", async function () {
    await expect(marketplace.connect(owner).setMarketplaceFeePercentage(5))
      .to.emit(marketplace, "OwnershipTransferred"); // Assuming Ownable emits this
    expect(await marketplace.marketplaceFeePercentage()).to.equal(5);
  });
});