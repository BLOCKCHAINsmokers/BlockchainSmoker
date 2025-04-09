# BlockchainSmoker

This repository contains the Solidity smart contracts for a decentralized ticketing system. The system enables event organizers to create and manage tickets, handle pre-registrations, facilitate ticket sales, and implement a loyalty program in a transparent and secure manner on the blockchain.

## Table of Contents

- [BlockchainSmoker](#blockchainsmoker)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [Contracts](#contracts)
  - [Testing](#testing)
  - [Usage](#usage)

## Overview

The decentralized ticketing system comprises the following core smart contracts:

- **TicketFactory:** Deploys and manages `Ticket` contracts for individual events. Controls event creator permissions.
- **Ticket:** Represents an ERC721 ticket for a specific event, containing details like category, price, and seat number.
- **PreRegistration:** Handles user pre-registration for events, payment deposits, a ballot system for fair ticket allocation, and the initial ticket sale.
- **TicketMarketplace:** Provides a platform for users to resell their purchased tickets, enforcing a resale profit cap.
- **LoyaltyProgram:** Manages a loyalty points system where users earn points for ticket purchases.

## Getting Started

Follow these steps to set up the project locally.

### Prerequisites

Make sure you have the following installed:

- **Node.js:** (Recommended version >= 16.x)
- **npm** (comes with Node.js) or **yarn**
- **Hardhat:** (Installation instructions below)

### Installation

1. **Clone the repository:**

    ```bash
    git clone https://github.com/BLOCKCHAINsmokers/BlockchainSmoker.git
    cd BlockchainSmoker
    ```

2. **Install dependencies:**
    Using npm:

    ```bash
    npm install
    ```

    Or using yarn:

    ```bash
    yarn install
    ```

3. **Install Hardhat:**
    If you haven't already, install Hardhat as a development dependency:

    ```bash
    npm install --save-dev hardhat
    # or
    yarn add --dev hardhat
    ```

## Contracts

A brief overview of each smart contract:

- **`TicketFactory.sol`:** Manages the creation of event-specific `Ticket` contracts and controls event creator permissions.
- **`Ticket.sol`:** Implements the ERC721 standard for individual event tickets, storing event details and ticket-specific information.
- **`PreRegistration.sol`:** Handles the pre-registration process, payment deposits, ticket allocation via a ballot, and the initial sale of tickets.
- **`TicketMarketplace.sol`:** Provides a platform for users to buy and sell tickets on a secondary market, with enforced resale price limits.
- **`LoyaltyProgram.sol`:** Manages a loyalty points system for users who purchase tickets.

## Testing

The repository includes comprehensive unit tests written using Hardhat and Chai. To run the tests:

```bash
npx hardhat test
# or
yarn hardhat test
```

## Usage

The general workflow involves:

1. **Event Organizers**: Use the `TicketFactory` (via the owner account) to create new event `Ticket` contracts, specifying event details and the authorized event creator.
2. **Event Creators**: Use the `TicketFactory` to mint tickets for their events, defining categories, prices, and seat numbers. They can also set approval for the `TicketMarketplace`.
3. **Users**:

   - Register for events on the PreRegistration contract.
   - Deposit payment for pre-registration.
   - Participate in the ballot (if enabled by the event organizer).
   - Purchase tickets during their allocated purchase slot on the PreRegistration contract.
   - List their purchased tickets for resale on the TicketMarketplace (within the profit cap).
   - Buy tickets listed on the TicketMarketplace.
   - Earn loyalty points through ticket purchases, tracked by the LoyaltyProgram.
