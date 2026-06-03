# ShopToSave Backend

The robust and scalable backend API powering the **ShopToSave** application, a platform for savings, gift cards, cashback tracking, and parcel delivery services.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL / MySQL (configured via `.env`)
- **Authentication**: JWT & custom middleware-based role checks
- **Key APIs**: Integrations with Woohoo Gift Cards and local services

## Project Structure

```text
shoptosave_backend/
├── app/                  # Core application codebase
│   ├── config/           # Database pools, rate limiters, and constants
│   │   └── constant/     # Global constant definitions
│   ├── controller/       # Express Controllers
│   ├── cron/             # Background scheduler and automated jobs
│   ├── helpers/          # Shared helpers and utility integrations
│   ├── middlewares/      # Security, JWT check, and validation middlewares
│   ├── routes/           # Route definitions with mounted controller actions
│   ├── services/         # Business Logic Layer (SQL query construction)
│   ├── utils/            # DB wrappers, logging, and other utilities
│   └── validations/      # Request schema validations
├── app.js                # Express application setup & middleware mounting
└── server.js             # App entry point (loads env & starts server)
```

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables in `.env` (refer to `.env.example` or existing config)
4. Start the development server:
   ```bash
   npm start
   ```
