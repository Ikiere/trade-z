# Trade-Z — AI Trading Operating System

<div align="center">

⚡ **Trade-Z** — An AI-powered trading operating system that continuously scans markets, evaluates opportunities with institutional discipline, explains every decision, and only trades when every condition is met.

[Getting Started](#getting-started) · [Architecture](#architecture) · [Tech Stack](#tech-stack)

</div>

---

## About

Trade-Z is **not** a forex signal website. It is an AI Trading Operating System that:

- 🧠 **Thinks before acting** — 25+ weighted factors analyzed per trade
- 🚫 **Rejects poor setups** — No trade is always better than a bad trade
- 📊 **Manages risk automatically** — Position sizing, daily loss limits, drawdown protection
- 💬 **Explains every decision** — Clear reasoning for approvals and rejections
- ⚡ **Supports 3 trading modes** — Manual, Semi-Automatic, Fully Automatic

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion |
| Backend | NestJS, TypeScript |
| AI Service | Python, FastAPI |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Cloudflare R2 |
| State | Zustand, TanStack Query |
| Charts | TradingView Lightweight Charts |
| Payments | Paystack |
| Email | Resend |
| Monorepo | pnpm Workspaces, Turborepo |

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Python >= 3.12

### Installation

```bash
# Clone the repo
git clone https://github.com/your-org/trade-z.git
cd trade-z

# Install dependencies
pnpm install

# Copy environment files
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
cp apps/ai-service/.env.example apps/ai-service/.env

# Start all services in development
pnpm dev
```

### Individual Services

```bash
pnpm dev:web     # Frontend on http://localhost:3000
pnpm dev:api     # Backend on http://localhost:3001
pnpm dev:ai      # AI Service on http://localhost:8000
```

## Architecture

```
trade-z/
├── apps/
│   ├── web/           # Next.js 15 Frontend
│   ├── api/           # NestJS Backend
│   ├── ai-service/    # Python FastAPI AI Engine
│   └── admin/         # Future Admin Dashboard
├── packages/
│   ├── types/         # Shared TypeScript Types
│   ├── validation/    # Shared Zod Schemas
│   ├── utils/         # Utility Functions
│   ├── config/        # Shared Configuration
│   ├── constants/     # Shared Constants
│   ├── hooks/         # Shared React Hooks
│   └── ui/            # Shared UI Components
├── supabase/
│   └── migrations/    # Database Migrations
├── docs/              # Documentation
└── scripts/           # Build & Deploy Scripts
```

## Development

```bash
pnpm build       # Build all packages and apps
pnpm lint        # Lint all packages
pnpm type-check  # TypeScript type checking
pnpm format      # Format with Prettier
```

## License

Private — All rights reserved.
