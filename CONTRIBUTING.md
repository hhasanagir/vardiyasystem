# Contributing to VardiyaSystem

## Development Setup

1. **Prerequisites**: Node.js 22+, PostgreSQL 16+
2. **Clone and install**:
   ```bash
   git clone <repo-url>
   cd vardiyasystem
   cd backend && npm install && cd ..
   cd frontend && npm install && cd ..
   ```
3. **Database**: Copy `backend/.env.example` to `backend/.env` and set your `DATABASE_URL`
4. **Apply migrations**: `cd backend && npx prisma migrate deploy`
5. **Start**: `cd backend && npm run start:dev` (port 3000), then `cd frontend && npm start` (port 4200)

## Code Standards

- **TypeScript**: Strict mode enabled. Avoid `any` types — use proper interfaces.
- **Frontend**: Angular 21 standalone components, signals, inline templates.
- **Backend**: NestJS 10, Prisma ORM, class-validator DTOs.
- **Formatting**: Prettier with `printWidth: 100`, `singleQuote: true`.
- **Commit messages**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).

## Testing

- **Backend unit**: `cd backend && npm test`
- **Backend e2e**: `cd backend && npm run test:e2e`
- **Frontend**: `cd frontend && npx vitest run`
- **All e2e**: `cd backend && npx vitest run --config ./e2e/vitest.config.ts`

## Pull Request Process

1. Create a feature branch from `main`.
2. Write tests for new functionality.
3. Ensure `npx tsc --noEmit` passes in both frontend and backend.
4. All existing e2e tests must pass.
5. Submit PR with a clear description of changes.
