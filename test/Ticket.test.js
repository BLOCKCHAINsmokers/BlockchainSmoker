const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ticket", function () {
  let Ticket, ticket, owner, factory, eventCreator;

  beforeEach(async function () {
    [owner, factory, eventCreator] = await ethers.getSigners();
    Ticket = await ethers.getContractFactory("Ticket");
    ticket = await Ticket.deploy("My Concert", "Artist Name", "Venue Name", Math.trunc(Date.now() / 1000 + 3600), Math.trunc(Date.now() / 1000 + 7200), factory.address, eventCreator.address);
  });

  it("Should have the correct event details", async function () {
    expect(await ticket.eventName()).to.equal("My Concert");
    expect(await ticket.artist()).to.equal("Artist Name");
    expect(await ticket.venue()).to.equal("Venue Name");
  });

  it("Should allow the factory to mint new tickets", async function () {
    await expect(ticket.connect(factory).mint(owner.address, "VIP", ethers.parseEther("1"), "A1"))
      .to.emit(ticket, "TicketMinted")
      .withArgs(0, owner.address, "VIP", ethers.parseEther("1"), "A1");
    expect(await ticket.ownerOf(0)).to.equal(owner.address);
    expect(await ticket.category(0)).to.equal("VIP");
    expect(await ticket.price(0)).to.equal(ethers.parseEther("1"));
    expect(await ticket.seatNumber(0)).to.equal("A1");
  });

  it("Should prevent non-factory addresses from minting tickets", async function () {
    await expect(ticket.mint(owner.address, "General", ethers.parseEther("0.5"), "")).to.be.revertedWith(
      "Only the ticket factory can call this function."
    );
  });

  it("Should allow the factory to mark a ticket as used", async function () {
    await ticket.connect(factory).mint(owner.address, "General", ethers.parseEther("0.5"), "");
    await expect(ticket.connect(factory).markAsUsed(0))
      .to.emit(ticket, "TicketUsed")
      .withArgs(0);
    expect(await ticket.isUsed(0)).to.equal(true);
  });

  it("Should prevent marking a non-existent ticket as used", async function () {
    await expect(ticket.connect(factory).markAsUsed(1)).to.be.revertedWith("Ticket does not exist.");
  });

  it("Should prevent marking an already used ticket as used again", async function () {
    await ticket.connect(factory).mint(owner.address, "General", ethers.parseEther("0.5"), "");
    await ticket.connect(factory).markAsUsed(0);
    await expect(ticket.connect(factory).markAsUsed(0)).to.be.revertedWith("Ticket has already been used.");
  });
});