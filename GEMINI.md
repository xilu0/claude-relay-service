# Gemini Context: Claude Relay Service

## Project Overview
**Claude Relay Service** is a comprehensive Node.js middleware application designed to manage and relay requests to various LLM providers (Anthropic Claude, Google Gemini, OpenAI, AWS Bedrock, Azure OpenAI, etc.). It serves as a centralized hub for:
- **Multi-Account Management:** Pools multiple accounts to distribute load and manage costs.
- **Unified API:** Provides compatible endpoints for standard clients (Claude Code, Gemini CLI, Codex).
- **Access Control:** Implements its own API Key system with rate limiting, user management, and client restrictions.
- **Monitoring:** Tracks token usage, costs, and system performance.
- **Cost Control:** Implements granular billing, weekly quotas, and "booster packs" for over-quota usage.

## Tech Stack
- **Runtime:** Node.js (>=18.0.0)
- **Framework:** Express.js
- **Database:** Redis (used for storage, caching, session management, and rate limiting)
- **Frontend:** Vue.js (located in `web/admin-spa`)
- **Containerization:** Docker & Docker Compose

## Architecture & Key Components

### Core Services (`src/services/`)
The application logic is heavily service-oriented:
- **Relay Services:** Handle API forwarding for various providers:
  - `claudeRelayService.js` (Anthropic)
  - `geminiRelayService.js` (Google)
  - `azureOpenaiRelayService.js` (Azure)
  - `bedrockRelayService.js` (AWS Bedrock)
  - `ccrRelayService.js` (Claude Console Relay)
  - `droidRelayService.js` (Droid/Mobile API)
  - `openaiResponsesRelayService.js` (OpenAI compatible)
- **Account Services:** Manage credentials and token refreshing (e.g., `claudeAccountService.js`, `geminiAccountService.js`, `bedrockAccountService.js`).
- **Schedulers:** Select the best account for a request:
  - `unifiedClaudeScheduler.js`, `unifiedGeminiScheduler.js`, `unifiedOpenAIScheduler.js`
  - `droidScheduler.js`
- **Billing & Costs:**
  - `pricingService.js`: Unified model pricing and cost calculation.
  - `accountBalanceService.js`: Tracks account-level balances and costs.
  - `billingEventPublisher.js`: Publishes billing events for external consumption.
- **Core Logic:** `apiKeyService.js` (Auth), `userService.js` (User mgmt), `webhookService.js` (Notifications), `modelAlertService.js` (Monitoring).

### API Routes (`src/routes/`)
- **`/api` & `/claude`**: Endpoints compatible with Anthropic's API.
- **`/gemini`**: Endpoints compatible with Google's Gemini API.
- **`/openai`**: Endpoints compatible with OpenAI's Chat Completions API.
- **`/azure`**: Azure OpenAI compatible endpoints.
- **`/droid`**: Specialized routes for mobile/droid clients.
- **`/admin`**: Internal APIs for the management dashboard.
- **`/webhook`**: Incoming webhook handlers.

### Data Storage (Redis)
Data is stored in Redis with specific key patterns:
- **Keys & Config:**
  - `apikey:{id}`: API Key metadata.
  - `apikey:hash_map`: Maps hashed keys to IDs for fast lookup.
  - `apikey:index`: Hashed index of all API keys for performance.
  - `claude:account:{id}`, `gemini_account:{id}`, etc.: Encrypted account credentials.
- **Usage & Stats:**
  - `usage:{keyId}`: Aggregate usage for an API Key.
  - `usage:daily:{keyId}:{date}`, `usage:monthly:{keyId}:{month}`: Periodic stats.
  - `usage:model:daily:{model}:{date}`: System-wide model usage.
  - `usage:records:{keyId}`: List of recent request records.
- **Costs & Billing:**
  - `usage:cost:daily:{keyId}:{date}`, `usage:cost:total:{keyId}`: Token costs.
  - `usage:opus:weekly:{keyId}:{week}`: Specific tracking for expensive models.
  - `usage:cost:weekly:window_start:{keyId}`, `usage:cost:weekly:total:{keyId}`: Weekly quota tracking.
  - `usage:booster:used:{keyId}`, `usage:booster:records:{keyId}`: Over-quota "booster packs".
- **Account Usage:**
  - `account_usage:{accountId}`: Aggregate usage for a provider account.
  - `account_usage:daily:{accountId}:{date}`, `account_usage:model:daily:{accountId}:{model}:{date}`: Detailed account stats.

## Development & Usage

### Installation & Setup
1.  **Install Dependencies:** `npm install`
2.  **Configuration:**
    - Copy `config/config.example.js` to `config/config.js`.
    - Copy `.env.example` to `.env`.
3.  **Initialization:** `npm run setup`
4.  **Frontend:** `npm run install:web` && `npm run build:web`

### CLI Tools
- **Usage:** `npm run cli <command>`
- **Commands:** `status`, `keys list`, `accounts list`, `pricing update`.

## Important Notes for Changes
- **Conventions:** Use `async/await`. Follow Prettier formatting (`npm run format`).
- **Security:** Use `encryptionService` for sensitive data. NEVER hardcode secrets.
- **Redis:** Use `src/models/redis.js` for data access. Prefer `pipeline` for multiple operations.
- **UI:** Located in `web/admin-spa`, built with Vue.js and Tailwind CSS.