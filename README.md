# Flight Booking Service

A comprehensive microservice built with Node.js and Express that handles flight booking operations, payment processing, and seat management. This service integrates with a Flight Service microservice and uses message queues for asynchronous notifications.

---

## 📋 Project Overview

**Flight Booking Service** is a robust backend service designed to manage the complete booking lifecycle for an airline platform. It handles:
- Creating flight bookings with seat availability validation
- Processing payments with idempotency guarantees
- Canceling expired bookings automatically
- Sending notifications via message queues
- Database transactions for data consistency

This is a **production-ready microservice template** built following industry best practices and clean architecture principles.

---

## 🏗️ Project Architecture & Structure

### Directory Organization

```
Flight-Booking-Service/
├── src/                          # Main source code
│   ├── config/                   # Configuration setup files
│   ├── controllers/              # Request handlers
│   ├── middlewares/              # Request interceptors & validators
│   ├── models/                   # Database schema definitions
│   ├── repositories/             # Database access layer
│   ├── services/                 # Business logic layer
│   ├── routes/                   # API endpoint definitions
│   ├── utils/                    # Helper functions & utilities
│   └── index.js                  # Application entry point
├── migrations/                   # Database schema migrations
├── package.json                  # Project dependencies
├── .env                          # Environment variables
└── README.md                     # This file
```

---

## 📁 Detailed Component Explanation

### 1. **`src/config/` - Configuration Layer**

Centralizes all application configuration and setup:

- **`server-config.js`** - Loads environment variables using `dotenv`
  - `PORT`: Server port (e.g., 3002)
  - `FLIGHT_SERVICE`: URL of the Flight Service microservice (e.g., http://localhost:3001)
  
- **`logger-config.js`** - Sets up Winston logging for monitoring
  - Logs to both console and file (`combined.log`)
  - Includes timestamps for debugging
  
- **`queue-config.js`** - Configures RabbitMQ message queue connection
  - Connects to local RabbitMQ broker (`amqp://localhost`)
  - Manages the `noti-queue` for notifications
  
- **`index.js`** - Exports all configurations for easy access

### 2. **`src/routes/` - API Endpoint Definitions**

Defines all API endpoints and route handlers:

- **`v1/booking.js`** - Booking-related endpoints
  - `POST /` - Create a new booking
  - `POST /payments` - Process payment for a booking
  
- **`index.js`** - Aggregates all route files for the main app

### 3. **`src/controllers/booking-controller.js` - Request Handlers**

Acts as the entry point for HTTP requests. Responsibilities:
- **`createBooking(req, res)`** - Receives booking request and delegates to service
  - Extracts: `flightId`, `userId`, `noofSeats`
  - Returns structured response with HTTP status codes
  
- **`makePayment(req, res)`** - Handles payment requests
  - Validates idempotency key to prevent duplicate payments
  - Stores processed keys in `inMemDb` to ensure payment can't be retried
  - Extracts: `totalCost`, `userId`, `bookingId`
  - Error handling for duplicates and server errors

**Key Feature**: In-memory database (`inMemDb`) implements **idempotency** - payment requests with the same key are rejected if already processed.

### 4. **`src/services/booking-service.js` - Business Logic Layer**

Contains core booking logic and orchestrates operations:

- **`createBooking(data)`**
  1. Creates database transaction for atomicity
  2. Calls Flight Service API to validate flight exists and has available seats
  3. Calculates total billing amount: `noofSeats × price`
  4. Creates booking record in database
  5. Decreases available seats in Flight Service
  6. Commits transaction if all succeeds, otherwise rollbacks
  
- **`makePayment(data)`**
  1. Retrieves booking details from database
  2. Validates booking hasn't been cancelled
  3. Checks 5-minute expiration window: `currentTime - bookingTime > 300,000ms`
  4. Verifies payment amount matches booking cost
  5. Verifies user ID matches booking owner
  6. Updates booking status to BOOKED
  7. Sends notification message to queue (email to customer)
  8. Handles transaction rollback on validation failures
  
- **`cancelBooking(bookingId)`**
  1. Retrieves booking from database
  2. Returns seats to Flight Service (increase seat count)
  3. Marks booking as CANCELLED
  4. Uses transactions for data consistency
  
- **`cancelOldBookings()`**
  1. Queries bookings older than 5 minutes with INITIATED status
  2. Called by cron job every 30 minutes
  3. Auto-cancels unpaid bookings to free up seat inventory

### 5. **`src/repositories/booking-repository.js` - Database Access Layer**

Provides abstraction for database operations (extends `CrudRepository`):

- **`createBooking(data, transaction)`** - Inserts new booking with transaction support
- **`get(id, transaction)`** - Retrieves booking by ID with validation
- **`update(id, data, transaction)`** - Updates booking fields (mainly status)
- **`cancelOldBookings(timestamp)`** - Complex query to find and cancel expired bookings
  - Uses Sequelize operators (`Op`) for building WHERE clauses
  - Finds bookings created before timestamp, not yet BOOKED or CANCELLED

**Purpose**: Isolates database operations so they can be tested independently and reused.

### 6. **`src/models/booking.js` - Data Schema Definition**

Defines the `Booking` table structure using Sequelize ORM:

```
┌─────────────────────────────────────┐
│          Booking Table              │
├─────────────────────────────────────┤
│ id (PK, auto-increment)             │
│ flightId (INT)                      │
│ userId (INT)                        │
│ status (ENUM)                       │
│ noofSeats (INT)                     │
│ totalCost (INT)                     │
│ createdAt (timestamp)               │
│ updatedAt (timestamp)               │
└─────────────────────────────────────┘
```

**Status Values**:
- `INITIATED` - Booking created, awaiting payment (default)
- `PENDING` - Reserved status
- `BOOKED` - Payment completed, booking confirmed
- `CANCELLED` - Auto-cancelled due to expiration or user action

### 7. **`src/utils/common/` - Utility Functions**

- **`enums.js`** - Constants for booking statuses and seat types
- **`error-response.js`** - Standardized error response format
- **`success-response.js`** - Standardized success response format
- **`cron-jobs.js`** - Scheduled tasks (runs every 30 minutes to cancel expired bookings)

### 8. **`src/utils/errors/app-error.js`** - Custom Error Handling

Custom error class for application-specific errors with HTTP status codes.

---

## 🔄 Request Flow Diagram

### Create Booking Flow
```
POST /api/bookings
    ↓
BookingController.createBooking()
    ↓
BookingService.createBooking()
    ├→ Validate with Flight Service API
    ├→ Calculate total cost
    ├→ Create booking (DB transaction)
    ├→ Update flight seats (API call)
    ├→ Commit transaction
    ↓
Return booking with INITIATED status
```

### Make Payment Flow
```
POST /api/bookings/payments
    ↓
Validate idempotency key
    ↓
BookingController.makePayment()
    ↓
BookingService.makePayment()
    ├→ Validate booking not cancelled
    ├→ Check expiration (5 minutes)
    ├→ Verify amount matches
    ├→ Verify user ID matches
    ├→ Update status to BOOKED (transaction)
    ├→ Send notification to queue
    ├→ Commit transaction
    ↓
Return success ✓
```

### Auto-Cancellation Flow (Every 30 minutes)
```
Cron Job (*/30 * * * *)
    ↓
BookingService.cancelOldBookings()
    ↓
Find bookings > 5 minutes old, status not BOOKED/CANCELLED
    ↓
Set status to CANCELLED
    ↓
Automatic cleanup complete
```

---

## 🔧 Technology Stack

| Technology | Purpose |
|-----------|---------|
| **Express.js** v4.18.2 | Web framework for APIs |
| **Sequelize** v6.31.1 | ORM for database operations |
| **MySQL2** v3.2.4 | MySQL database driver |
| **RabbitMQ (amqplib)** v0.10.3 | Message queue for notifications |
| **Axios** v1.4.0 | HTTP client for microservice calls |
| **node-cron** v3.0.2 | Scheduled task execution |
| **Winston** v3.8.2 | Logging library |
| **http-status-codes** v2.2.0 | HTTP status code constants |
| **dotenv** v16.0.3 | Environment variable management |
| **Nodemon** v2.0.22 | Auto-restart on file changes (dev) |

---

## 📥 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MySQL database
- RabbitMQ server (running at `localhost:5672`)
- Flight Service microservice (running at configured URL)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Create Environment File
Create `.env` in the root directory:
```env
PORT=3002
FLIGHT_SERVICE=http://localhost:3001
```

### Step 3: Database Setup
```bash
cd src
npx sequelize init
```

This generates:
- `config/config.json` - Database connection settings
- `migrations/` - Schema migration files
- `seeders/` - Test data files

### Step 4: Configure Database Connection
Edit `src/config/config.json` - for **development**:
```json
{
  "development": {
    "username": "your_db_user",
    "password": "your_db_password",
    "database": "booking_service_db",
    "host": "localhost",
    "dialect": "mysql"
  }
}
```

### Step 5: Run Migrations
```bash
npx sequelize db:migrate
```

### Step 6: Start the Server
```bash
npm run dev
```

Expected output:
```
Successfully started the server on PORT : 3002
queue connected
```

---

## 📡 API Endpoints

### 1. Create Booking
```
POST /api/bookings
Content-Type: application/json

{
  "flightId": 1,
  "userId": 5,
  "noofSeats": 2
}

Response:
{
  "data": {
    "id": 1,
    "flightId": 1,
    "userId": 5,
    "noofSeats": 2,
    "totalCost": 15000,
    "status": "initiated",
    "createdAt": "2026-03-30T10:30:00Z",
    "updatedAt": "2026-03-30T10:30:00Z"
  }
}
```

### 2. Make Payment
```
POST /api/bookings/payments
Content-Type: application/json
x-idempotency-key: unique-key-123

{
  "bookingId": 1,
  "userId": 5,
  "totalCost": 15000
}

Response:
{
  "data": "Payment successful"
}

Error Cases:
- Missing idempotency key → 400
- Duplicate payment (key already exists) → 400
- Booking expired (> 5 minutes) → 400
- Amount mismatch → 400
- User mismatch → 400
- Cancelled booking → 400
```

---

## 🔐 Key Features & Design Patterns

### 1. **Idempotency for Payments**
- Uses `x-idempotency-key` header to prevent duplicate payments
- In-memory tracking prevents double-charging
- Production: Use database table with unique constraint

### 2. **Database Transactions**
- All multi-step operations use Sequelize transactions
- Ensures ACID properties (Atomicity, Consistency, Isolation, Durability)
- Automatic rollback on errors

### 3. **Microservice Integration**
- Validates flights via Flight Service API before booking
- Updates seat count in Flight Service
- Handles API failures gracefully

### 4. **Automatic Expiration**
- Bookings expire after 5 minutes without payment
- Cron job runs every 30 minutes to clean up expired bookings
- Automatically returns seats to Flight Service

### 5. **Event-Driven Notifications**
- Payment confirmation sent to RabbitMQ queue
- Asynchronous notification service consumes messages
- Prevents blocking API responses

### 6. **Clean Architecture**
- **Controllers** - HTTP handling only
- **Services** - Business logic
- **Repositories** - Data access
- **Models** - Schema definition
- Clear separation of concerns

---

## 🚀 Production Considerations

### Security Improvements Needed
1. **Authentication/Authorization** - Add JWT validation middleware
2. **Input Validation** - Add request validators (joi, yup)
3. **Rate Limiting** - Prevent abuse with rate limiter middleware
4. **Error Logging** - Log errors to external service (e.g., Sentry)

### Idempotency Improvements
```javascript
// Current: In-memory (lost on restart)
// Production: Use persistent storage

CREATE TABLE idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  response JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Monitoring & Observability
- Winston logs go to `combined.log` file
- Query performance monitoring
- Message queue monitoring
- API response time tracking

### Database Optimization
- Add indexes on frequently queried fields
- Partition bookings table by date for large datasets
- Archive old cancelled bookings

---

## 📝 Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `PORT` | Server port | `3002` |
| `FLIGHT_SERVICE` | Flight microservice URL | `http://localhost:3001` |

---

## 🧪 Testing the Service

### 1. Create a booking
```bash
curl -X POST http://localhost:3002/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"flightId": 1, "userId": 5, "noofSeats": 2}'
```

### 2. Make payment (note the booking ID from response)
```bash
curl -X POST http://localhost:3002/api/bookings/payments \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: payment-001" \
  -d '{"bookingId": 1, "userId": 5, "totalCost": 15000}'
```

### 3. Try duplicate payment (should fail)
```bash
curl -X POST http://localhost:3002/api/bookings/payments \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: payment-001" \
  -d '{"bookingId": 1, "userId": 5, "totalCost": 15000}'

# Response: {"message": "Cannot retry on a successful payment"}
```

---

## 📊 Data Flow Summary

1. **User** creates a booking → Service validates with Flight Service → Booking stored in DB (status: INITIATED)
2. **User** makes payment → Service validates conditions → Status changed to BOOKED → Notification sent
3. **Expired bookings** → Cron job detects old INITIATED bookings → Auto-cancels → Seats returned
4. **All operations** use transactions to ensure data consistency

---

## 📚 File-by-File Breakdown

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.js` | 20 | Entry point, initializes Express, cron, queue |
| `src/controllers/booking-controller.js` | 55 | HTTP request handlers |
| `src/services/booking-service.js` | 100+ | Core business logic |
| `src/repositories/booking-repository.js` | 50+ | Database query methods |
| `src/models/booking.js` | 40 | Database schema definition |
| `src/config/queue-config.js` | 25 | RabbitMQ setup |
| `src/utils/common/cron-jobs.js` | 10 | Scheduled task runner |

---

## 🤝 Contributing

This is a production-ready template. Feel free to:
- Add more booking features (refunds, modifications)
- Implement API authentication
- Add comprehensive logging
- Create unit/integration tests
- Deploy to cloud platforms

---

## 📄 License

ISC

---

## 👤 Author

Sanket

---

## ⚡ Quick Commands

```bash
# Install dependencies
npm install

# Start development server (with auto-reload)
npm run dev

# Run database migrations
npx sequelize db:migrate

# View logs
tail -f combined.log

# Connect to RabbitMQ management (if installed)
# http://localhost:15672 (default: guest/guest)
```

---

## 🎯 Next Steps

1. Set up Flight Service microservice (separate project)
2. Configure RabbitMQ for notifications
3. Set up notification/email service consuming from queue
4. Add authentication middleware
5. Create comprehensive test suite
6. Deploy to production environment

---

**Happy Coding! 🚀**
