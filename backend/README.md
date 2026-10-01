# VardiyaOS Backend API

NestJS + PostgreSQL + Prisma

## Quick Start

### 1. Setup Database

```bash
# Start PostgreSQL (Docker)
docker run -d --name vardiya-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=vardiya123 \
  -e POSTGRES_DB=vardiya \
  -p 5432:5432 \
  postgres:15-alpine
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 4. Generate Prisma Client & Migrate

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Seed Database

```bash
npm run seed
```

### 6. Start Server

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Auth

- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user

### Schedules

- `GET /api/v1/schedules` - List all schedules
- `POST /api/v1/schedules` - Create schedule
- `GET /api/v1/schedules/:id` - Get schedule
- `PUT /api/v1/schedules/:id` - Update schedule
- `DELETE /api/v1/schedules/:id` - Delete schedule
- `GET /api/v1/schedules/:id/snapshots` - Get versions
- `POST /api/v1/schedules/:id/rollback/:version` - Rollback
- `POST /api/v1/schedules/:id/assignments` - Add assignment
- `DELETE /api/v1/schedules/:id/assignments/:assignmentId` - Remove assignment

### Personnel

- `GET /api/v1/personnel` - List all
- `GET /api/v1/personnel/:id` - Get by ID
- `GET /api/v1/personnel/:id/workload` - Get workload
- `POST /api/v1/personnel` - Create
- `PUT /api/v1/personnel/:id` - Update

### Units

- `GET /api/v1/units` - List all
- `GET /api/v1/units/:id` - Get by ID
- `GET /api/v1/units/:id/devices` - Get devices

### Holidays

- `GET /api/v1/holidays` - List holidays
- `POST /api/v1/holidays/seed-2026` - Seed 2026 holidays

### Audit Logs

- `GET /api/v1/audit-logs` - List all logs
- `GET /api/v1/audit-logs/entity/:type/:id` - Logs for entity

## Features

- **JWT Authentication** - Secure token-based auth
- **Schedule Versioning** - Full audit trail with rollback
- **Optimistic Locking** - Version-based conflict detection
- **Audit Trail** - All changes logged
- **Swagger Docs** - Available at `/api/docs`

## Default Credentials

After seeding:

- Email: `admin@hospital.com`
- Password: `admin123`
