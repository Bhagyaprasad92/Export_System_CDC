# 🔄 CDC Export System

A production-ready, containerized data export system that uses **Change Data Capture (CDC)** principles to efficiently synchronize large datasets. Built with **Node.js**, **Express**, and **PostgreSQL**, this system implements watermark-based tracking to enable full, incremental, and delta exports via a REST API.

---

## 📋 Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Export Strategies](#export-strategies)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)

---

## Architecture

```
┌─────────────┐       ┌──────────────────────────────────┐
│   Consumer   │──────▶│         Express API (:8080)       │
│  (curl/app)  │◀──────│                                  │
└─────────────┘       │  ┌──────────┐  ┌──────────────┐  │
                      │  │  Routes   │  │  Job Manager  │  │
                      │  └─────┬────┘  └──────┬───────┘  │
                      │        │              │          │
                      │  ┌─────▼──────────────▼────────┐ │
                      │  │      Export Service          │ │
                      │  │  (full / incremental / delta)│ │
                      │  └─────┬──────────────┬────────┘ │
                      │        │              │          │
                      │  ┌─────▼─────┐  ┌─────▼──────┐  │
                      │  │ Watermark  │  │ CSV Writer  │  │
                      │  │ Service    │  │ (fast-csv)  │  │
                      │  └─────┬─────┘  └─────┬──────┘  │
                      └────────┼──────────────┼──────────┘
                               │              │
                      ┌────────▼───────┐ ┌────▼──────┐
                      │  PostgreSQL    │ │ ./output/  │
                      │  users         │ │ (CSV files)│
                      │  watermarks    │ │            │
                      └────────────────┘ └───────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Watermarking** | Tracks the `updated_at` timestamp of the last successfully exported record per consumer. Subsequent exports only process newer data. |
| **Soft Deletes** | Records use an `is_deleted` flag instead of hard deletion, enabling delta exports to communicate DELETE operations to consumers. |
| **Async Jobs** | Export endpoints return `202 Accepted` immediately while the actual export runs in the background, preventing HTTP timeouts on large datasets. |
| **Transactional Safety** | Watermarks are updated within the same database transaction as the export query. On failure, the watermark rolls back — ensuring no data is skipped. |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

---

## Quick Start

### 1. Clone and Start

```bash
git clone <repo-url>
cd Expert_System_CDC
docker-compose up --build
```

This will automatically:
1. Start PostgreSQL 13 with health checks
2. Create `users` and `watermarks` tables
3. Seed **100,000+ user records** (idempotent — safe to run multiple times)
4. Start the API server on **port 8080**

> **Note:** The database seeding generates 100k users in batches and may take ~30 seconds on first startup. Subsequent starts skip seeding if data already exists.

### 2. Verify It's Running

```bash
curl http://localhost:8080/health
# → {"status":"ok","timestamp":"2025-06-15T10:30:00.000Z"}
```

### 3. Run a Full Export

```bash
curl -X POST http://localhost:8080/exports/full -H "X-Consumer-ID: my-app"

OR

Invoke-WebRequest `
  -Uri "http://localhost:8080/exports/full" `
  -Method POST `
  -Headers @{"X-Consumer-ID"="my-app"} `
  -UseBasicParsing

# → {"jobId":"abc-123","status":"started","exportType":"full","outputFilename":"full_my-app_1718451234.csv"}
```

After a few seconds, check the `output/` directory for the generated CSV file.

### 4. Check the Watermark

```bash
curl http://localhost:8080/exports/watermark -H "X-Consumer-ID: my-app"

OR

Invoke-WebRequest `
  -Uri "http://localhost:8080/exports/watermark" `
  -Headers @{"X-Consumer-ID"="my-app"} `
  -UseBasicParsing

# → {"consumerId":"my-app","lastExportedAt":"2025-06-15T10:30:00.000Z"}
```

### 5. Run an Incremental Export

```bash
# Update a record in the database
docker-compose exec db psql -U user -d mydatabase -c \
  "UPDATE users SET name='MODIFIED USER', updated_at=NOW() WHERE id=1;"

# Export only the changes
curl -X POST http://localhost:8080/exports/incremental -H "X-Consumer-ID: my-app"

OR

Invoke-WebRequest `
  -Uri "http://localhost:8080/exports/incremental" `
  -Method POST `
  -Headers @{"X-Consumer-ID"="my-app"} `
  -UseBasicParsing
  
# → Only the modified record(s) will appear in the new CSV
```

---

## API Reference

All export endpoints require the `X-Consumer-ID` header to identify the data consumer.

### `GET /health`

Health check endpoint.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "timestamp": "2025-06-15T10:30:00.000Z"
}
```

---

### `POST /exports/full`

Triggers a full export of all non-deleted users.

**Headers:** `X-Consumer-ID: <consumer-id>`

**Response `202 Accepted`:**
```json
{
  "jobId": "a1b2c3d4-e5f6-...",
  "status": "started",
  "exportType": "full",
  "outputFilename": "full_my-app_1718451234.csv"
}
```

**Behavior:** Exports all rows where `is_deleted = FALSE` to a CSV file. Updates the consumer's watermark to the latest `updated_at` from the exported data.

---

### `POST /exports/incremental`

Triggers an incremental export of recently changed data.

**Headers:** `X-Consumer-ID: <consumer-id>`

**Response `202 Accepted`:**
```json
{
  "jobId": "a1b2c3d4-e5f6-...",
  "status": "started",
  "exportType": "incremental",
  "outputFilename": "incremental_my-app_1718451234.csv"
}
```

**Behavior:** Exports non-deleted rows where `updated_at > last watermark`. Updates watermark on success.

---

### `POST /exports/delta`

Triggers a delta export with operation type annotations.

**Headers:** `X-Consumer-ID: <consumer-id>`

**Response `202 Accepted`:**
```json
{
  "jobId": "a1b2c3d4-e5f6-...",
  "status": "started",
  "exportType": "delta",
  "outputFilename": "delta_my-app_1718451234.csv"
}
```

**Behavior:** Like incremental, but includes soft-deleted rows and adds an `operation` column:
- `INSERT` — record's `created_at` equals `updated_at`
- `UPDATE` — record's `created_at` differs from `updated_at`
- `DELETE` — record's `is_deleted` is `true`

---

### `GET /exports/watermark`

Retrieves the current watermark for a consumer.

**Headers:** `X-Consumer-ID: <consumer-id>`

**Response `200 OK`:**
```json
{
  "consumerId": "my-app",
  "lastExportedAt": "2025-06-15T10:30:00.000Z"
}
```

**Response `404 Not Found`:** If no watermark exists for the consumer.

---

## Export Strategies

| Type | Includes Deleted | Operation Column | Use Case |
|------|:---:|:---:|---|
| **Full** | ✗ | ✗ | Initial data dump, disaster recovery |
| **Incremental** | ✗ | ✗ | Regular sync of active records |
| **Delta** | ✓ | ✓ | Complex replication with INSERT/UPDATE/DELETE tracking |

### CSV Output Examples

**Full / Incremental:**
```csv
id,name,email,created_at,updated_at,is_deleted
1,Alice Smith,alice@gmail.com,2025-06-01T08:00:00.000Z,2025-06-10T14:30:00.000Z,false
```

**Delta:**
```csv
operation,id,name,email,created_at,updated_at,is_deleted
INSERT,101,New User,new@gmail.com,2025-06-15T12:00:00.000Z,2025-06-15T12:00:00.000Z,false
UPDATE,42,Updated User,updated@gmail.com,2025-06-01T08:00:00.000Z,2025-06-15T12:00:00.000Z,false
DELETE,7,Deleted User,deleted@gmail.com,2025-06-01T08:00:00.000Z,2025-06-15T12:00:00.000Z,true
```

---

## Database Schema

### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Unique user identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | User's full name |
| `email` | `VARCHAR(255)` | `NOT NULL, UNIQUE` | User's email address |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Last update timestamp (**indexed**) |
| `is_deleted` | `BOOLEAN` | `NOT NULL, DEFAULT FALSE` | Soft delete flag |

### `watermarks`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `SERIAL` | `PRIMARY KEY` | Unique watermark identifier |
| `consumer_id` | `VARCHAR(255)` | `NOT NULL, UNIQUE` | Consumer identifier |
| `last_exported_at` | `TIMESTAMPTZ` | `NOT NULL` | High-water mark timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | Watermark record update time |

### Seeded Data

- **100,000+ users** with realistic names and emails
- Timestamps distributed over **30 days**
- **~2% soft-deleted** (`is_deleted = TRUE`, ≥1,000 records)
- Idempotent: re-running the seed script is safe

---

## Testing

### Run Tests Inside Docker

```bash
# Run all tests
docker-compose exec app npm test

# Run tests with coverage report
docker-compose exec app npm run test:coverage
```

### Run Tests Locally

```bash
npm install
npm test
npm run test:coverage
```

### Coverage Report

The test suite achieves **88.78% statement coverage** (threshold: 70%):

| Module | Statements | Branches | Functions | Lines |
|--------|-----------|----------|-----------|-------|
| `config.js` | 100% | 90% | 100% | 100% |
| `exportService.js` | 94.8% | 85.7% | 100% | 94.8% |
| `watermarkService.js` | 100% | 100% | 100% | 100% |
| `jobManager.js` | 100% | 80% | 100% | 100% |
| `csvWriter.js` | 100% | 100% | 100% | 100% |
| `routes/*` | 100% | 100% | 100% | 100% |
| **Overall** | **88.78%** | **83.6%** | **81.25%** | **88.78%** |

### Test Structure

- **Unit Tests** (`tests/unit/`): Test individual modules with mocked dependencies
  - `jobManager.test.js` — Job lifecycle (start, complete, fail, clear)
  - `csvWriter.test.js` — CSV output, dates, edge cases
  - `watermarkService.test.js` — Get/upsert with transactional client
  - `exportService.test.js` — Full/incremental/delta logic, rollback on error
- **Integration Tests** (`tests/integration/`): Test API endpoints with supertest
  - `api.test.js` — All endpoints, status codes, error handling

---

## Environment Variables

All environment variables are documented in [`.env.example`](.env.example):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@db:5432/mydatabase` |
| `PORT` | Application port | `8080` |
| `NODE_ENV` | Runtime environment | `production` |
| `LOG_LEVEL` | Logging verbosity (`error`, `warn`, `info`, `debug`) | `info` |

---

## Project Structure

```
├── docker-compose.yml        # Service orchestration (app + db)
├── Dockerfile                # Node 18 Alpine container image
├── package.json              # Dependencies and scripts
├── jest.config.js            # Test config with 70% coverage threshold
├── .env.example              # Environment variable documentation
├── .gitignore                # Excludes node_modules, CSVs, .env
├── README.md                 # This file
│
├── seeds/
│   └── 01_init.sql           # Schema creation + 100k user seed
│
├── src/
│   ├── index.js              # Express app entry point + graceful shutdown
│   ├── config.js             # Environment configuration
│   ├── db.js                 # PostgreSQL connection pool
│   ├── logger.js             # Winston JSON structured logging
│   ├── routes/
│   │   ├── health.js         # GET /health
│   │   └── exports.js        # POST /exports/*, GET /exports/watermark
│   ├── services/
│   │   ├── jobManager.js     # Async job lifecycle tracking
│   │   ├── exportService.js  # Full/incremental/delta export logic
│   │   └── watermarkService.js # Watermark CRUD operations
│   └── utils/
│       └── csvWriter.js      # Stream-based CSV file writer
│
├── tests/
│   ├── unit/                 # Unit tests (mocked DB)
│   └── integration/          # API integration tests
│
└── output/                   # Generated CSV export files (gitignored)
    └── .gitkeep
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **In-memory job manager** | Simpler than Redis/RabbitMQ for a single-service deployment. For multi-instance scaling, replace with a message queue. |
| **SQL-generated seed data** | Using `generate_series` in PostgreSQL is faster than application-level seeding and doesn't require additional runtime dependencies like Faker. |
| **DB transactions for exports** | Wrapping the export query + watermark update in a single transaction ensures atomicity — the watermark is never updated if the export fails. |
| **`fast-csv` streaming** | Memory-efficient CSV writing for large datasets. Rows are streamed to disk rather than buffered entirely in memory. |
| **Index on `updated_at`** | Critical for CDC query performance. Without it, incremental/delta exports on 100k+ rows would require full table scans. |
| **Consumer-scoped watermarks** | Each consumer tracks its own progress independently, allowing multiple downstream systems to consume at their own pace. |

---

## Structured Logging

The application produces JSON-formatted logs for all export events:

```json
{"level":"info","message":"Export job started","jobId":"abc-123","consumerId":"my-app","exportType":"full","service":"cdc-export-system","timestamp":"2025-06-15T10:30:00.000Z"}
{"level":"info","message":"Export job completed","jobId":"abc-123","rowsExported":98000,"duration":"2450ms","service":"cdc-export-system","timestamp":"2025-06-15T10:30:02.450Z"}
```

View logs with:
```bash
docker logs kalesh-app-1
```
