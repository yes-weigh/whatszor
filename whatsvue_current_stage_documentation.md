# WhatsVue - Current Stage & Architecture Documentation
*Last Updated: 2026-05-18*

## Executive Summary
WhatsVue is a monolithic B2B SaaS platform designed to provide WhatsApp-based CRM, Marketing, and Automation solutions for Indian businesses. The system utilizes a modern TypeScript stack, heavily relying on Fastify (backend), Next.js 14 (frontend), PostgreSQL (via Prisma), and Redis/BullMQ (for background processing). 

The platform connects to WhatsApp via a custom `@itsukichan/baileys` fork, explicitly bypassing the Meta Cloud API to avoid template approval restrictions.

---

## 🏗️ Architecture Overview

### 1. Repository Structure (PNPM Workspace)
- **`apps/api`**: Fastify REST backend. Handles core business logic, database connections, job queuing, and WhatsApp WebSocket sessions.
- **`apps/web`**: Next.js 14 (App Router) frontend. Handles the user interface, utilizing standard React components, TailwindCSS, and client-side data fetching.
- **`packages/*`**: Shared libraries and utilities (if applicable).

### 2. Core Infrastructure Components
- **Database**: PostgreSQL managed by Prisma ORM. Schema definitions reside in `schema.prisma`.
- **Queueing Engine**: Redis + BullMQ. Used extensively for background jobs, message dispatching, and campaign scheduling.
- **WhatsApp Client**: `@itsukichan/baileys` (Websocket-based implementation) managed as persistent in-memory sessions per workspace.
- **AI Integrations**: Native Google Gemini API (`@google/genai`) used for chatbot replies, flow generation, and lead intent extraction.

---

## 📊 Module Status & Maturity

### ✅ 1. Campaign System (Completed)
The bulk messaging engine used for marketing broadcasts.
- **Status:** **Completed and Production-Ready**
- **Recent Updates:** Fixed true delay-based scheduling in BullMQ, added `CampaignTimeSeries` model for analytical tracking, and resolved frontend accessibility (ARIA) linter errors in the audience exclusion toggles.
- **Capabilities:**
  - Audience filtering and dynamic exclusion logic.
  - Rate-limited and batched dispatching via `outbound-message.worker.ts`.
  - Hourly statistical tracking through the `CampaignTimeSeries` analytics layer.

### ✅ 2. CRM & Contact Management (Completed)
The centralized directory for managing leads and customers.
- **Status:** **Completed**
- **Capabilities:**
  - Contact creation, tagging, and tiered loyalty mapping.
  - Custom attributes and product interest mapping via AI intents.

### ✅ 3. Multi-Tenant Workspaces (Completed)
- **Status:** **Completed**
- **Capabilities:**
  - Secure tenant isolation via Prisma queries (`workspaceId`).
  - Seat-based member limits and Role-Based Access Control (RBAC).

### ✅ 4. AI & Chatbot Engine (Completed / Active)
- **Status:** **Completed**
- **Capabilities:**
  - Autonomous conversational agent utilizing Gemini (`gemini-2.5-flash`).
  - Function calling allows the AI to trigger native CRM tools (`update_contact_info`, `map_product_interest`).
  - Natural language Automation Flow Generator and Lead Query expanding.

### 🔄 5. Automation Engine (Partially Implemented -> Stabilizing)
The rule-based workflow builder for trigger-action automation.
- **Status:** **Stabilizing**
- **Capabilities:** 
  - Visual builder (React Flow) on the frontend.
  - Active background execution via `automation-worker.ts` and `keyword-automation.service.ts`.
- **Pending/Next Steps:** Expand supported node execution handlers and stabilize complex multi-branch condition loops.

### 🔄 6. Media System (Partially Implemented)
- **Status:** **Partially Implemented (Technical Debt)**
- **Pending/Next Steps:** Currently relying on local/Docker volume storage. Needs full migration to an S3-compatible `STORAGE_PROVIDER` (e.g., AWS S3, Cloudflare R2) for stateless scalability.

---

## 🚀 Known Technical Debt & Future Scalability

1. **Memory Bloat (WebSocket Sessions):**
   Holding multiple persistent Baileys WebSocket connections in a single Node.js process will eventually hit memory limits. Future scalability requires horizontal sharding of the WhatsApp connection manager across multiple microservices or dedicated pods.
2. **Storage Migration:**
   As mentioned above, local filesystem storage for media uploads must be migrated to an S3 bucket before launching at scale to prevent container state-loss.
3. **Database Indexing:**
   As `CampaignTimeSeries` and `Message` tables grow, continuous monitoring of PostgreSQL indexes is required to prevent dashboard performance degradation.

---
*End of Documentation*
