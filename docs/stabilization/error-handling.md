# Error Handling Architecture

## Global Exception Filter (`backend/src/filters/all-exceptions.filter.ts`)

Added comprehensive Prisma error mapping:

| Prisma Error | HTTP Status               | Description                          |
| ------------ | ------------------------- | ------------------------------------ |
| P2000        | 400 Bad Request           | Value too long for column            |
| P2002        | 409 Conflict              | Unique constraint violation          |
| P2003        | 400 Bad Request           | Foreign key constraint violation     |
| P2025        | 404 Not Found             | Record to update/delete not found    |
| P2016        | 400 Bad Request           | Query interpretation error           |
| P2023        | 400 Bad Request           | Inconsistent column data             |
| P2001        | 400 Bad Request           | Record not found in where clause     |
| P2015        | 404 Not Found             | Related record not found             |
| P2018        | 400 Bad Request           | Required connected records not found |
| P2021        | 503 Service Unavailable   | Table does not exist                 |
| P2024        | 503 Service Unavailable   | Connection pool timeout              |
| All others   | 500 Internal Server Error | Unhandled Prisma error               |

## Existing Infrastructure (Already Robust)

- **Global Exception Filter** — catches all exceptions, structured JSON response
- **Logging Interceptor** — logs request/response with duration
- **Winston Logger** — structured JSON logs with correlation IDs
- **OpenTelemetry** — traces for distributed monitoring
- **CorrelationService** — AsyncLocalStorage for request tracing

## Service-Layer Patterns

### Backend Services

- Query-level guards for nullable fields
- `.catch(() => {})` on non-critical audit log calls
- Existence checks before update/delete operations

### Frontend Services

- All HTTP calls wrapped with `.pipe(catchError(() => of(fallback)))`
- Fallback values: `[]` for arrays, `null` for objects, `0` for counts
- Error logged via LoggerService for observability
- UI components handle `null`/empty state gracefully (ngIf loading/error)
