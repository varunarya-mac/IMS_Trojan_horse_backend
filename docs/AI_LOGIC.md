# AI Logic Documentation

This document explains the AI-powered features in the IoT Refrigeration system, focusing on the RAG (Retrieval-Augmented Generation) architecture and intelligent fallback mechanisms.

---

## Architecture Overview

```
User Question
      │
      ▼
┌─────────────────────┐
│   fn-chat-api       │  ← Entry point
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  fn-chat-processor  │  ← AI orchestration
│  ┌───────────────┐  │
│  │ Guardrail     │  │  ← Input validation
│  │ RAG Service   │  │  ← Knowledge retrieval
│  │ OpenAI        │  │  ← Response generation
│  └───────────────┘  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  fn-vector-search   │  ← ChromaDB vector search
└─────────────────────┘
```

---

## 1. Knowledge Base Setup (`scripts/setup-chromadb.ts`)

### Document Processing Pipeline

1. **Extract Text**: Read `.docx` file using `mammoth`
2. **Chunk Text**: Split into ~2000 character chunks with 150 char overlap
3. **Generate Summary**: Use GPT-4o to create comprehensive document summary
4. **Generate Embeddings**: Create vectors using `text-embedding-3-small`
5. **Upload to ChromaDB**: Store chunks + summary in ChromaDB Cloud

### Chunking Logic

```
Document → Clean text → Split by paragraphs/sentences → Overlap chunks
```

- **Chunk Size**: ~2000 characters (~400 tokens)
- **Overlap**: 150 characters (maintains context between chunks)
- **Break Points**: Prefers paragraph/sentence boundaries

### Pre-computed Summary

All document chunks are passed to GPT-4o to generate a comprehensive summary covering:
- Key concepts and terminology
- Common alarm patterns
- Diagnostic techniques
- Troubleshooting procedures
- Best practices
- Equipment types

The summary is stored as a special chunk with ID `document_summary` for fallback scenarios.

---

## 2. Vector Search (`fn-vector-search`)

### Actions

| Action | Description |
|--------|-------------|
| `search` | Semantic search against knowledge base |
| `get_summary` | Retrieve pre-computed document summary |
| `health` | Check service health |

### Search Flow

```
Query → OpenAI Embedding → ChromaDB Query → Cosine Similarity → Ranked Results
```

1. **Generate Query Embedding**: Convert user question to vector using `text-embedding-3-small`
2. **Vector Search**: Query ChromaDB with cosine similarity
3. **Score Filtering**: Filter results below `minScore` threshold (default: 0.5)
4. **Return Results**: Top K results with content, score, and metadata

### Similarity Scoring

- **1.0**: Perfect match
- **0.7-1.0**: Highly relevant
- **0.5-0.7**: Moderately relevant
- **< 0.5**: Low relevance (filtered out)

---

## 3. Chat Processor (`fn-chat-processor`)

### Smart RAG with Fallback Logic

The system uses a hybrid approach to handle both specific and generic questions:

```
                  User Question
                       │
                       ▼
              ┌────────────────┐
              │ Is Generic?    │
              │ (pattern match)│
              └───────┬────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
    YES: Generic              NO: Specific
         │                         │
         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│ Fetch Summary   │      │ Vector Search   │
│ (get_summary)   │      │ (RAG search)    │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │                        ▼
         │               ┌────────────────┐
         │               │ High Confidence│
         │               │ (score ≥ 0.6)? │
         │               └───────┬────────┘
         │                       │
         │          ┌────────────┴────────────┐
         │          │                         │
         │          ▼                         ▼
         │     YES: Use                  NO: Fallback
         │     RAG Results               to Summary
         │          │                         │
         │          │                    ┌────┴────┐
         │          │                    ▼         │
         │          │           Fetch Summary      │
         │          │                │             │
         │          │                ▼             │
         │          │        Combine Summary       │
         │          │        + Partial Results     │
         │          │                │             │
         └──────────┴────────────────┴─────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Build AI Prompt │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ OpenAI Analysis │
                    └─────────────────┘
```

### Generic Question Detection

Questions are considered "generic" if they match patterns like:
- "What is refrigeration?"
- "Tell me about the system"
- "Explain how alarms work"
- "Give me an overview"
- "Summarize the process"

```typescript
const genericPatterns = [
  /^(what|tell me|explain|describe).*(about|overview|summary|information)/i,
  /^(how does|what is).*(work|system|process)/i,
  /general\s+(information|overview|summary)/i,
  /^summarize/i,
  /^overview/i,
];
```

### Fallback Conditions

Summary fallback is triggered when:
1. **Generic question detected** → Use summary directly
2. **No RAG results** → Use summary
3. **Low confidence** (best score < 0.6) → Combine summary + partial results

---

## 4. Guardrail System

### Layer 1: Input Sanitization

- Strip potentially harmful characters
- Normalize whitespace
- Truncate excessive length

### Layer 2: Semantic Validation

Uses OpenAI to check if the question is related to refrigeration topics:

```
Allowed: Refrigeration, temperature monitoring, cold chain, alarms, IoT sensors
Blocked: Unrelated topics, harmful requests, off-topic questions
```

### Layer 3: Output Validation

Validates AI response for:
- No hallucinated data
- No personal information leakage
- Appropriate response format

---

## 5. AI Response Generation

### Prompt Structure

```
SYSTEM: Refrigeration expert system prompt
        + RAG context (relevant chunks OR summary)

USER:   CSV data summary (if provided)
        + Message history (last 3 messages)
        + Current question
```

### Response Extraction

The AI response is parsed to extract:
- **Content**: Main text response
- **Recommendations**: Prioritized action items (high/medium/low)
- **Data Points**: Key metrics with labels, values, and units

---

## 6. Graph Generation

When CSV data is provided, the system:
1. Analyzes the data structure
2. Asks AI for graph recommendation (type, title, axes)
3. Generates chart using Chart.js
4. Uploads image to Appwrite Storage

### Supported Graph Types
- Line charts (time series)
- Bar charts (comparisons)
- Scatter plots (correlations)

---

## Configuration

### Environment Variables

```bash
# ChromaDB Cloud
CHROMADB_TENANT=<tenant-id>
CHROMADB_API_KEY=<api-key>
CHROMADB_DATABASE=IMS_Alarm_management

# OpenAI
OPENAI_API_KEY=<api-key>

# Function IDs
FN_VECTOR_SEARCH_ID=fn-vector-search
FN_CHAT_PROCESSOR_ID=fn-chat-processor
```

### Tunable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `topK` | 5 | Max results from vector search |
| `minScore` | 0.5 | Minimum similarity score |
| `confidenceThreshold` | 0.6 | Score below which fallback is used |
| `chunkSize` | 2000 chars | Size of text chunks |
| `chunkOverlap` | 150 chars | Overlap between chunks |

---

## Flow Summary

1. **User sends question** → fn-chat-api receives it
2. **Guardrail check** → Validates question is on-topic
3. **RAG decision** → Generic? → Use summary. Specific? → Vector search
4. **Fallback check** → Low confidence? → Add summary to context
5. **Build prompt** → Combine RAG context + CSV data + history
6. **OpenAI call** → Generate response with domain knowledge
7. **Parse response** → Extract content, recommendations, data points
8. **Graph check** → If CSV provided, potentially generate visualization
9. **Return response** → Send complete response to user
