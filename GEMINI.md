# Gemini Context: Claude Relay Service

## Project Overview
**Claude Relay Service** is a comprehensive Node.js middleware application designed to manage and relay requests to various LLM providers (Anthropic Claude, Google Gemini, OpenAI, AWS Bedrock, Azure OpenAI, etc.). It serves as a centralized hub for:
- **Multi-Account Management:** Pools multiple accounts to distribute load and manage costs.
- **Unified API:** Provides compatible endpoints for standard clients (Claude Code, Gemini CLI, Codex).
- **Access Control:** Implements its own API Key system with rate limiting, user management, and client restrictions.
- **Monitoring:** Tracks token usage, costs, and system performance.

## Tech Stack
- **Runtime:** Node.js (>=18.0.0)
- **Framework:** Express.js
- **Database:** Redis (used for storage, caching, session management, and rate limiting)
- **Frontend:** Vue.js (located in `web/admin-spa`)
- **Containerization:** Docker & Docker Compose

## Architecture & Key Components

### Core Services (`src/services/`)
The application logic is heavily service-oriented:
- **Relay Services:** Handle the actual API forwarding (e.g., `claudeRelayService.js`, `geminiRelayService.js`).
- **Account Services:** Manage credential storage and token refreshing (e.g., `claudeAccountService.js`, `geminiAccountService.js`).
- **Schedulers:** "Unified Schedulers" (e.g., `unifiedClaudeScheduler.js`) intelligently select the best account for a request based on load, session stickiness, and priority.
- **Core Logic:** `apiKeyService.js` (Auth), `pricingService.js` (Cost calculation), `userService.js` (User mgmt).

### API Routes (`src/routes/`)
- **`/api` & `/claude`**: Endpoints compatible with Anthropic's API.
- **`/gemini`**: Endpoints compatible with Google's Gemini API.
- **`/openai`**: Endpoints compatible with OpenAI's Chat Completions API (often used for Codex).
- **`/admin`**: Internal APIs for the management dashboard.

### Data Storage (Redis)
Data is stored in Redis with specific key patterns:
- **`api_key:{id}`**: API Key metadata and configuration.
- **`claude_account:{id}`**, **`gemini_account:{id}`**: Encrypted account credentials.
- **`rate_limit:{keyId}:{window}`**: Usage counters for rate limiting.
- **`usage:...`**: various keys for tracking token consumption.

## Development & Usage

### Installation & Setup
1.  **Install Dependencies:** `npm install`
2.  **Configuration:**
    - Copy `config/config.example.js` to `config/config.js`.
    - Copy `.env.example` to `.env` and set `JWT_SECRET`, `ENCRYPTION_KEY`, and Redis connection details.
3.  **Initialization:** Run `npm run setup` to generate admin credentials (stored in `data/init.json`).
4.  **Frontend:**
    - `npm run install:web`
    - `npm run build:web`

### Running the Application
- **Development:** `npm run dev` (uses `nodemon` for hot reload).
- **Production:** `npm start` (or `npm run service:start:daemon` for background process).
- **Docker:** `docker-compose up -d`.

### Testing & Code Quality
- **Tests:** `npm test` (Uses Jest).
- **Linting:** `npm run lint` (ESLint).
- **Formatting:** `npm run format` (Prettier). **Note:** Prettier is mandatory for all files.

### CLI Tools
The project includes a CLI for management:
- **Usage:** `npm run cli <command>`
- **Examples:**
    - `npm run cli status`: Check system status.
    - `npm run cli keys list`: List API keys.
    - `npm run cli accounts list`: List configured accounts.

## Important Notes for Changes
- **Conventions:** Strictly follow the existing coding style. Use `async/await` for asynchronous operations.
- **Security:** **NEVER** hardcode credentials. Use the `encryptionService` or `claudeAccountService` patterns to handle sensitive data.
- **Redis:** Ensure all Redis keys follow the established naming conventions found in `src/models/redis.js` or `CLAUDE.md`.
- **Frontend:** When modifying the UI (`web/admin-spa`), ensure compatibility with both Light and Dark modes (Tailwind CSS `dark:` prefix).
