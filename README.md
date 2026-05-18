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
├── config/         # Database and third-party API configurations
├── constant/       # Status codes, constants, and action helpers
├── controllers/    # Request handlers and business logic entry points
├── middlewares/    # Auth and validation middlewares
├── routes/         # Express API route definitions
├── services/       # Service layer for database queries and core workflows
├── utils/          # Helper utilities and shared functions
├── validations/    # Request schema validation rules
├── app.js          # Express app initialization
└── server.js       # App entrypoint & server listener
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
