# Codebase Stabilization – Change Summary (Handoff for AI)

This folder contains ~40 uncommitted file changes that represent **Phases 1 through 6 of a structured stabilization refactor** across the full-stack monorepo (Frontend UI, Backend Core, Queue Workers, and Shared Packages).

A raw Git unified diff of all modifications (excluding lockfiles) is available in the root directory at `uncommitted_changes.diff`.

## Context & Rationales

The following is a breakdown of *what* changed and *why*, specifically designed for another AI model evaluating this branch:

### 1. Frontend Architecture & UI Consistency (Phase 1)
- **What Changed:** `apps/web/src/components/ui/` (new files like `DataTable.tsx`, `Modal.tsx`, `Dropdown.tsx`, `FormField.tsx`) and `apps/web/src/hooks/useContacts.ts`.
- **Why:** We centralized all fundamental UI logic into shared primitives using headless Radix UI components (Dialog, DropdownMenu) and Tailwind CSS. We shifted away from putting raw data fetching `useEffect` hooks inside pages (like `ContactsPage`) and enforced abstracting business logic into isolated React Hooks (e.g., `useContacts.ts`). This ensures reusable, bug-free components.

### 2. Backend Standardization & Error Handling (Phase 2 & 4)
- **What Changed:** `packages/shared/src/utils/errors.ts`, `packages/shared/src/schemas/messaging.ts`, `vitest.workspace.ts`.
- **Why:** We eliminated disparate `createError` utilities spread across microservices and extracted a single canonical `AppError` and `createError` implementation into the `@whatszor/shared` package. We also added a Vitest workspace for unit testing shared logic. We strictly enforce API responses to return `ApiResponse<T>` instead of raw objects.

### 3. Media Flow Refactoring (Phase 5)
- **What Changed:** `apps/api/prisma/schema.prisma` (renamed `mediaGalleryId` to `mediaId`), messaging controllers, `apps/api/src/core/storage/index.ts`.
- **Why:** To support "Reusable Media", the underlying DB mapping was updated. Backend services were updated to allow users to attach media by sending a `{ mediaId }` via API rather than forcing continuous re-uploads. The frontend `MediaGalleryPicker` was also adapted to dispatch attachment flows without triggering redundant file upload calls.

### 4. Operational Safety & Observability Log Instrumentation (Phase 6)
**[CRITICAL INFRASTRUCTURE]**
- **What Changed:** `apps/api/src/core/logger.ts`, `apps/api/src/core/server.ts`, `apps/api/src/core/context.ts`, `apps/api/src/core/redis.ts`, `apps/api/src/queues/worker.ts`.
- **Why:** Rebuilt observability from the ground up:
  1. **Structured Logging:** Integrated `pino`. Replaced unstructured `console.log` entirely. A central `createLogger(context)` wrapper enforces metadata shape (e.g., `module`, `action`).
  2. **Trace Propagation:** Using `AsyncLocalStorage` via standard middleware, an incoming HTTP `traceId` (and `workspaceId`) is automatically attached to downstream log events.
  3. **BullMQ Injection:** `queues/index.ts` auto-injects `traceId` into queue payloads, ensuring worker execution strings logs with the web request.
  4. **Worker Resiliency:** Implemented detailed queue heartbeat (`5s`), robust job lifecycle logging (`info` to start, `warn` on retry, `error` on exhaustion, `fatal` on DLQ).
  5. **Backlog Monitoring:** A 60-second polling loop checks job counts, throwing alerts sequentially (`100+` = warning, `1000+` = paging).

### 5. Vendor-Agnostic Fatal Alerting (Phase 6)
- **What Changed:** `apps/api/src/core/alert.ts`, `apps/api/src/start-worker.ts`, `apps/api/src/modules/whatsapp/whatsapp.service.ts`.
- **Why:** Implemented a failsafe `sendAlert()` utility capable of dispatching unhandled rejections, Redis disconnects (`ECONNREFUSED`), and unexpected session logouts to an external HTTP receiver (`ALERT_WEBHOOK_URL`). The architecture fails silently on webhook errors to guarantee the main task never crashes from an alert notification failure.

## Read Strategy for the Analyzing AI

1. Start with the core architectural shifts in `apps/api/src/core/logger.ts` and `apps/api/src/core/server.ts` to understand how the new context flows.
2. Examine `packages/shared/src/utils/errors.ts` to see our unified error standard.
3. Review `/apps/web/src/components/ui/` to understand the standard of design primitives applied going forward.
4. Reference the `uncommitted_changes.diff` file generated in the working directory root for exact code patching details.
