# IoT Alarm Flow Management Backend

A serverless backend system for managing IoT alarm configurations and AI-powered refrigeration data analysis. Built on Appwrite Cloud with TypeScript.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Appwrite Deployment](#appwrite-deployment)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [License](#license)

## Features

### Alarm Flow Management
- CRUD operations for alarm patterns and configurations
- Version control with rollback capabilities
- Audit trail for all configuration changes
- Import/export configuration JSON
- Discipline and class management

### AI-Powered Refrigeration Chat
- GPT-4o powered analysis of refrigeration CSV data
- RAG (Retrieval-Augmented Generation) with ChromaDB vector search
- Automatic graph generation from CSV data
- Semantic guardrails to ensure on-topic responses
- Real-time message processing with Appwrite subscriptions

### Background Processing
- Async message processing pipeline
- Scheduled cleanup jobs (context, files, archived chats)
- Vector search for domain knowledge retrieval

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js >= 22.0.0 |
| Language | TypeScript 5.9 |
| Platform | Appwrite Cloud |
| AI/LLM | OpenAI GPT-4o |
| Vector Database | ChromaDB |
| Validation | Zod |
| Build Tool | esbuild |

## Project Structure

```
.
├── lib/                          # Shared library
│   ├── constants/                # Application constants
│   ├── types/                    # TypeScript interfaces and DTOs
│   ├── repositories/             # Data access layer
│   ├── services/                 # Business logic services
│   └── utils/                    # Utility functions
│
├── functions/                    # Appwrite serverless functions
│   ├── fn-alarm-management/      # Alarm CRUD, versioning, import
│   ├── fn-chat-api/              # Chat & message REST API
│   ├── fn-chat-processor/        # AI processing (async)
│   ├── fn-vector-search/         # ChromaDB RAG search
│   └── fn-job-worker/            # CRON cleanup worker
│
├── docs/                         # Documentation
│   ├── openapi.yaml              # API specification
│   ├── AI_LOGIC.md               # AI architecture docs
│   ├── alarm_flow_architecture.md
│   └── chat-architecture.md
│
├── scripts/                      # Setup and seed scripts
│   ├── setup-chromadb.ts         # Initialize ChromaDB knowledge base
│   └── setup-refrigeration-db.ts # Initialize database schema
│
├── appwrite.config.json          # Appwrite deployment configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json                  # Project dependencies and scripts
```

## Prerequisites

- **Node.js** >= 22.0.0
- **npm** >= 10.0.0
- **Appwrite Cloud** account with a project created
- **OpenAI** API key with GPT-4o access
- **ChromaDB Cloud** account (for RAG functionality)
- **Appwrite CLI** installed globally

```bash
npm install -g appwrite-cli
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd IMS_Trojan_horse_backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   npm run install:functions
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Build the shared library**
   ```bash
   npm run build:lib
   ```

5. **Initialize databases** (first-time setup)
   ```bash
   npm run setup-refrigeration-db
   npm run setup-chromadb
   ```

6. **Build all functions**
   ```bash
   npm run build
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `APPWRITE_ENDPOINT` | Appwrite API endpoint URL | Yes |
| `APPWRITE_PROJECT_ID` | Your Appwrite project ID | Yes |
| `APPWRITE_API_KEY` | Appwrite API key with full permissions | Yes |
| `APPWRITE_DATABASE_ID` | Database ID (default: `iot_alarm_management`) | Yes |
| `NODE_ENV` | Environment (`development` or `production`) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `OPENAI_MODEL` | Primary model (default: `gpt-4o`) | No |
| `OPENAI_GUARDRAIL_MODEL` | Guardrail model (default: `gpt-4o-mini`) | No |
| `REFRIGERATION_BUCKET_ID` | Storage bucket ID for files | Yes |
| `CHROMADB_TENANT` | ChromaDB tenant ID | Yes |
| `CHROMADB_API_KEY` | ChromaDB API key | Yes |
| `CHROMADB_DATABASE` | ChromaDB database name | Yes |
| `FN_CHAT_PROCESSOR_ID` | Chat processor function ID | Yes |
| `FN_VECTOR_SEARCH_ID` | Vector search function ID | Yes |
| `CONTEXT_MESSAGE_COUNT` | Messages to retain in context (default: 3) | No |
| `CONTEXT_EXPIRY_HOURS` | Context expiry time in hours (default: 24) | No |
| `CHAT_ARCHIVE_AGE_DAYS` | Days before archiving chats (default: 30) | No |

## Development

### Available Scripts

```bash
# Build all functions
npm run build

# Build specific function
npm run build:fn-alarm-management
npm run build:fn-chat-api
npm run build:fn-chat-processor
npm run build:fn-vector-search
npm run build:fn-job-worker

# Build shared library
npm run build:lib

# Linting
npm run lint
npm run lint:fix

# Code formatting
npm run format
npm run format:check

# Database setup
npm run setup-refrigeration-db
npm run setup-chromadb
npm run seed
```

### Code Quality

The project uses:
- **ESLint** for TypeScript linting
- **Prettier** for code formatting
- **EditorConfig** for consistent editor settings

## Appwrite Deployment

### 1. Login to Appwrite CLI

```bash
appwrite login
```

### 2. Link to your project

```bash
appwrite init project
```

### 3. Deploy functions

```bash
# Deploy all functions
appwrite deploy function

# Or deploy specific function
appwrite deploy function --function-id fn-alarm-management
```

### 4. Configure function environment variables

In the Appwrite Console:
1. Navigate to **Functions** > Select function
2. Go to **Settings** > **Variables**
3. Add all required environment variables from `.env`

### 5. Set up scheduled execution (for fn-job-worker)

The `fn-job-worker` function runs on a CRON schedule (`*/15 * * * *` - every 15 minutes). Configure this in the Appwrite Console under the function's **Schedule** settings.

### 6. Enable Realtime (for async chat)

Ensure Appwrite Realtime is enabled for the `messages` collection to support async chat processing.

## API Documentation

Full API documentation is available in OpenAPI 3.0 format:

- **OpenAPI Spec**: [`docs/openapi.yaml`](docs/openapi.yaml)

### Quick Reference

#### Alarm Management API (`fn-alarm-management`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/disciplines` | List all disciplines |
| GET | `/alarm-flows` | Get alarm flows |
| GET | `/alarm-patterns/{key}` | Get alarm pattern |
| POST | `/alarm-patterns` | Create alarm pattern |
| PUT | `/alarm-patterns/{key}` | Update alarm pattern |
| DELETE | `/alarm-patterns/{key}` | Delete alarm pattern |
| GET | `/alarm-patterns/{key}/versions` | Get version history |
| POST | `/alarm-patterns/{key}/rollback` | Rollback to version |
| GET | `/classes` | Get classes |
| PUT | `/classes/{id}` | Update class |
| POST | `/import` | Import configuration |

#### Chat API (`fn-chat-api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chats` | List chats |
| POST | `/chats` | Create chat |
| GET | `/chats/{chatId}` | Get chat details |
| DELETE | `/chats/{chatId}` | Delete chat |
| POST | `/chats/{chatId}/messages` | Send message |
| GET | `/chats/{chatId}/messages` | List messages |

## Architecture

### System Overview

```
┌─────────────────┐     ┌──────────────────────┐
│   Client App    │────▶│   fn-alarm-management │
└─────────────────┘     └──────────────────────┘
        │                         │
        │               ┌─────────▼─────────┐
        │               │  Appwrite Database │
        │               └───────────────────┘
        │
        ▼
┌─────────────────┐     ┌──────────────────────┐
│   fn-chat-api   │────▶│  fn-chat-processor   │
└─────────────────┘     └──────────────────────┘
                                  │
                        ┌─────────▼─────────┐
                        │  fn-vector-search  │
                        └───────────────────┘
                                  │
                        ┌─────────▼─────────┐
                        │     ChromaDB       │
                        └───────────────────┘
```

### Data Flow

1. **Alarm Management**: Synchronous CRUD operations with versioning
2. **Chat Processing**: Async pipeline with RAG and AI analysis
3. **Background Jobs**: Scheduled cleanup and maintenance

### Key Patterns

- **Repository Pattern**: Data access abstraction in `lib/repositories/`
- **Service Layer**: Business logic in `lib/services/`
- **Shared Library**: Common code in `lib/` consumed by all functions
- **Path Aliasing**: `@lib/*` resolves to shared library at build time
