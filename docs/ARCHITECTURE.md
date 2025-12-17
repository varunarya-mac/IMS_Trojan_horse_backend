# IoT Alarm Flow Management Backend - Architecture Design

## Overview

This document describes the architecture for a production-grade backend system that manages IoT device alarm flows for TESCO enterprise. The system uses **Appwrite Cloud** with **Node.js/TypeScript** to parse JSON configuration files, store alarm flows with versioning, and provide CRUD APIs.

---

## System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                         TESCO Enterprise                         │
├─────────────────────────────────────────────────────────────────┤
│  Disciplines: Refrigeration | HVAC | Energy | Fuel | Hot Counter │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Pack Alarms  │  │ Zone Alarms  │  │ AHU Alarms   │  ...      │
│  │ Case Alarms  │  │              │  │              │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (Appwrite Cloud)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Functions  │  │  Database   │  │    Auth     │              │
│  │  (Node.js)  │  │ (5 Tables)  │  │  (Users)    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend Application                        │
│         Visual Flow Editor for Alarm Pattern Management          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Entity Relationship Diagram

```
┌─────────────────┐
│   disciplines   │
├─────────────────┤
│ $id (PK)        │
│ name            │
│ enterpriseName  │
│ enterpriseVer   │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐
│ discipline_types│
├─────────────────┤
│ $id (PK)        │
│ disciplineId(FK)│◄─────────────────────────────┐
│ name            │                              │
└────────┬────────┘                              │
         │ 1:N                                   │ 1:N
         ▼                                       │
┌─────────────────┐      ┌─────────────────┐    │
│ alarm_patterns  │      │     classes     │    │
├─────────────────┤      ├─────────────────┤    │
│ $id (PK)        │      │ $id (PK)        │    │
│ disciplineTypeId│      │ disciplineTypeId│────┘
│ alarmPatternKey │      │ classId         │
│ version         │      │ description     │
│ isLatest        │      │ data (JSON)     │
│ programModules  │      │ patterns (JSON) │
│ createdBy       │      └─────────────────┘
│ changeDesc      │
└─────────────────┘
```

### Normalized Schema (5 Collections)

#### 1. disciplines
| Field | Type | Description |
|-------|------|-------------|
| `$id` | string | Auto-generated primary key |
| `name` | string | Unique name (refrigeration, hvac, energy, fuel) |
| `enterpriseName` | string | "TESCO" |
| `enterpriseVersion` | number | From JSON enterprise.version |
| `createdAt` | datetime | Creation timestamp |
| `updatedAt` | datetime | Last update timestamp |

#### 2. discipline_types
| Field | Type | Description |
|-------|------|-------------|
| `$id` | string | Auto-generated primary key |
| `disciplineId` | string | Foreign key to disciplines |
| `name` | string | Type name (pack, case, zone, ahu) |
| `createdAt` | datetime | Creation timestamp |

#### 3. alarm_patterns (Versioned)
| Field | Type | Description |
|-------|------|-------------|
| `$id` | string | Auto-generated primary key |
| `disciplineTypeId` | string | Foreign key to discipline_types |
| `alarmPatternKey` | string | Composite key for version grouping |
| `version` | number | Auto-increment per alarmPatternKey |
| `isLatest` | boolean | True for most recent version |
| `no` | number | Alarm pattern number |
| `alarmId` | string | Alarm identifier (e.g., "CM_LIQUID_LEVEL") |
| `textExpr` | string | Display text expression |
| `genericFamily` | string | Alarm family classification |
| `genericId` | string | Generic identifier |
| `trapPdu1` | string | Trap PDU value |
| `trapFlag` | number | Trap flag (0 or 1) |
| `suppressionPeriod` | number | Suppression time in seconds |
| `programModules` | string | JSON-stringified program modules array |
| `createdAt` | datetime | Version creation timestamp |
| `createdBy` | string | User ID who created this version |
| `changeDescription` | string | Audit: description of changes |

#### 4. classes
| Field | Type | Description |
|-------|------|-------------|
| `$id` | string | Auto-generated primary key |
| `disciplineTypeId` | string | Foreign key to discipline_types |
| `classId` | string | Class identifier (HT, LT, HTCO2) |
| `description` | string | Class description |
| `defaultFlag` | number | Default flag value |
| `data` | string | JSON-stringified threshold data |
| `patterns` | string | JSON-stringified patterns array |
| `createdAt` | datetime | Creation timestamp |

#### 5. fields (Optional)
| Field | Type | Description |
|-------|------|-------------|
| `$id` | string | Auto-generated primary key |
| `disciplineTypeId` | string | Foreign key to discipline_types |
| `name` | string | Field name |
| `arrayType` | string | Array type definition |
| `arraySize` | number | Size of array |
| `fieldType1` | string | Primary field type |
| `fieldType2` | string | Secondary field type (nullable) |

---

## Versioning Strategy

### Version Scope: Per Alarm Pattern

Each `alarm_pattern` has its own independent version history. When a user modifies an alarm pattern (adds/removes nodes, changes parameters), a new version is created.

```
alarm_pattern: CM_LIQUID_LEVEL
├── Version 1 (isLatest: false) - Initial import
├── Version 2 (isLatest: false) - Added AVG node
├── Version 3 (isLatest: false) - Changed threshold
└── Version 4 (isLatest: true)  - Current version
```

### Version Key Strategy

```
alarmPatternKey = {disciplineTypeId}_{alarmId}

Example: "abc123_CM_LIQUID_LEVEL"
```

### Update Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Update Alarm Pattern                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Client sends PUT /api/alarm-patterns/:key                │
│    Body: { programModules, changeDescription }              │
│                                                             │
│ 2. Server fetches current version (isLatest=true)           │
│                                                             │
│ 3. Server sets current.isLatest = false                     │
│                                                             │
│ 4. Server creates new document:                             │
│    {                                                        │
│      ...updatedData,                                        │
│      version: current.version + 1,                          │
│      isLatest: true,                                        │
│      createdAt: now(),                                      │
│      createdBy: userId,                                     │
│      changeDescription: "Added threshold node"              │
│    }                                                        │
│                                                             │
│ 5. Return new version to client                             │
└─────────────────────────────────────────────────────────────┘
```

### Query Patterns

| Query | Filter |
|-------|--------|
| Get all latest alarms | `disciplineTypeId = X AND isLatest = true` |
| Get specific alarm (latest) | `alarmPatternKey = X AND isLatest = true` |
| Get version history | `alarmPatternKey = X ORDER BY version DESC` |
| Get specific version | `alarmPatternKey = X AND version = N` |

---

## API Design

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import-config` | Parse and import JSON configuration |
| GET | `/api/disciplines` | List all disciplines |
| GET | `/api/discipline-types/:typeId/alarms` | Get latest alarm patterns |
| GET | `/api/alarm-patterns/:key` | Get latest version of alarm |
| PUT | `/api/alarm-patterns/:key` | Create new version |
| POST | `/api/discipline-types/:typeId/alarm-patterns` | Create new alarm |
| DELETE | `/api/alarm-patterns/:key` | Soft delete alarm |
| GET | `/api/alarm-patterns/:key/versions` | Get version history |
| GET | `/api/alarm-patterns/:key/versions/:ver` | Get specific version |
| POST | `/api/alarm-patterns/:key/rollback` | Rollback to version |
| GET | `/api/discipline-types/:typeId/classes` | Get classes |
| PUT | `/api/classes/:id` | Update class |

### Response Format

```typescript
// GET /api/discipline-types/:typeId/alarms
{
  "success": true,
  "data": {
    "discipline": {
      "id": "abc123",
      "name": "refrigeration"
    },
    "disciplineType": {
      "id": "def456",
      "name": "pack"
    },
    "alarms": [
      {
        "id": "ghi789",
        "alarmPatternKey": "def456_CM_LIQUID_LEVEL",
        "version": 3,
        "alarmId": "CM_LIQUID_LEVEL",
        "textExpr": "\"CM Liquid Level\"",
        "programModules": [
          { "type": 0, "name": "$CM_LIQUID_LEVEL", "x": 100, "y": 50 },
          { "type": 1, "name": "$a", "inputs": ["$CM_LIQUID_LEVEL"], "x": 200, "y": 50 }
        ],
        "createdAt": "2024-01-15T10:30:00Z",
        "createdBy": "user123"
      }
    ]
  }
}
```

---

## Program Module Types

| Type | Symbol | Description | Example |
|------|--------|-------------|---------|
| 0 | (label) | Input/Output node | `{ type: 0, name: "$CM_LIQUID_LEVEL" }` |
| 1 | > | Over threshold | `{ type: 1, inputs: ["$val"], classes: ["HT"] }` |
| 2 | < | Under threshold | `{ type: 2, inputs: ["$val"], classes: ["LT"] }` |
| 3 | AVG | Time average | `{ type: 3, inputs: ["$val"], parameters: ["300"] }` |
| 7 | MIN | Minimum of inputs | `{ type: 7, inputs: ["$a", "$b"] }` |
| 8 | MAX | Maximum of inputs | `{ type: 8, inputs: ["$a", "$b"] }` |
| 12 | - | Subtraction | `{ type: 12, inputs: ["$a", "$b"] }` |
| 15 | CMP | Compare | `{ type: 15, inputs: ["$val"], parameters: ["false", "true"] }` |
| 16 | CHG | Change detection | `{ type: 16, inputs: ["$val"], parameters: ["5"] }` |
| 17 | IFNUL | Null fallback | `{ type: 17, inputs: ["$val", "$default"] }` |
| 18 | SEV | Severity (0-6) | `{ type: 18, inputs: ["$sev1", "$sev2"] }` |
| 19 | TD | Time difference | `{ type: 19, inputs: ["$time1", "$time2"] }` |
| 26 | COUNT | Count events | `{ type: 26, inputs: ["$events"], parameters: ["3", "600"] }` |

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Functions)                   │
│  - Request validation                                        │
│  - Authentication/Authorization                              │
│  - Response formatting                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                           │
│  - Business logic                                            │
│  - Version management                                        │
│  - Import/Export handling                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Repository Layer                          │
│  - Data access abstraction                                   │
│  - Join composition                                          │
│  - Caching                                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer (Appwrite)                 │
│  - 5 Collections                                             │
│  - Indexes                                                   │
│  - Queries                                                   │
└─────────────────────────────────────────────────────────────┘
```

### Repository Pattern

The repository layer handles the complexity of joins across normalized tables:

```typescript
class AlarmFlowRepository {
  // Composes full alarm flow DTO with context
  async getAlarmFlowsWithContext(disciplineTypeId: string): Promise<AlarmFlowDTO[]> {
    // Parallel fetch for performance
    const [disciplineType, alarms, classes] = await Promise.all([
      this.getDisciplineTypeWithDiscipline(disciplineTypeId),
      this.getLatestAlarms(disciplineTypeId),
      this.getClasses(disciplineTypeId)
    ]);

    return alarms.map(alarm => ({
      discipline: { id: disciplineType.discipline.$id, name: disciplineType.discipline.name },
      disciplineType: { id: disciplineType.$id, name: disciplineType.name },
      alarm: { ...alarm, programModules: JSON.parse(alarm.programModules) },
      relatedClasses: classes.filter(c => this.alarmUsesClass(alarm, c))
    }));
  }
}
```

---

## Design Decisions: Pros and Cons

### Decision 1: Normalized Schema (5 Collections)

**CHOSEN APPROACH**

#### Pros
| Benefit | Description |
|---------|-------------|
| **Data Integrity** | Single source of truth for discipline/type names. No duplicate data. |
| **Storage Efficiency** | Discipline and type metadata stored once, not duplicated per alarm. |
| **Independent Scaling** | Collections can be scaled/indexed independently based on query patterns. |
| **Query Flexibility** | Easy to add new queries (e.g., "all alarms across disciplines with severity > 3"). |
| **Audit Compliance** | Clean version history per alarm without polluting parent records. |
| **Future-Proofing** | Easy to add new relationships (sites, user permissions, alert rules). |
| **Referential Integrity** | Prevent orphan records; cascade operations when needed. |

#### Cons
| Drawback | Mitigation |
|----------|------------|
| **Join Complexity** | Repository pattern abstracts joins; parallel fetches minimize latency. |
| **Multiple Queries** | Caching of rarely-changing data (disciplines, types). |
| **Development Time** | One-time setup; long-term maintenance is simpler. |

### Decision 2: Denormalized Schema (Single Collection)

**REJECTED APPROACH**

```json
{
  "disciplineName": "refrigeration",
  "disciplineTypeName": "pack",
  "alarmId": "CM_LIQUID_LEVEL",
  "version": 3,
  "programModules": [...]
}
```

#### Pros
| Benefit | Description |
|---------|-------------|
| **Simple Queries** | Single collection fetch, no joins needed. |
| **Fast Reads** | All data in one document. |
| **Easy Setup** | Fewer collections to manage. |

#### Cons
| Drawback | Impact |
|----------|--------|
| **Data Duplication** | "refrigeration" stored thousands of times across alarms. |
| **Update Anomalies** | Renaming a discipline requires updating every alarm document. |
| **No Referential Integrity** | Typos create orphan categories. |
| **Bloated Documents** | Each alarm carries redundant metadata. |
| **Limited Querying** | Harder to get unique disciplines or types list. |
| **Storage Cost** | Higher storage for duplicated strings. |

### Decision 3: Version Per Alarm Pattern

**CHOSEN APPROACH**

#### Pros
| Benefit | Description |
|---------|-------------|
| **Granular History** | Each alarm has independent version timeline. |
| **Efficient Queries** | Fetch latest of all alarms with single query (isLatest=true). |
| **Selective Rollback** | Rollback one alarm without affecting others. |
| **Clean Audit Trail** | Know exactly who changed what alarm and when. |

#### Cons
| Drawback | Mitigation |
|----------|------------|
| **More Records** | Index on isLatest makes queries efficient. |
| **Complex Rollback** | Clear versioning logic in service layer. |

### Alternative: Version Per Discipline Type

**REJECTED**

If versioning was at discipline_type level, every alarm would get new version when any single alarm changes. This causes:
- Unnecessary record duplication
- Confusing audit trail
- Inability to track individual alarm changes

---

## Database Indexes

### Production Index Strategy

```
Collection: disciplines
├── name (unique)
└── enterpriseName + name (composite)

Collection: discipline_types
├── disciplineId + name (composite, unique)
└── name

Collection: alarm_patterns
├── disciplineTypeId + isLatest (composite) -- Primary listing query
├── alarmPatternKey + isLatest (composite)  -- Single alarm lookup
├── alarmPatternKey                         -- Version history
└── createdBy                               -- Audit queries

Collection: classes
├── disciplineTypeId
└── classId
```

---

## Security Considerations

1. **Authentication**: All API endpoints require valid Appwrite session
2. **Authorization**: User roles determine read/write access per discipline
3. **Audit Trail**: Every change records userId and timestamp
4. **Input Validation**: All inputs validated before database operations
5. **Rate Limiting**: Appwrite built-in rate limiting on functions

---

## Performance Considerations

1. **Parallel Fetches**: Repository layer fetches related data in parallel
2. **Caching**: Discipline and type metadata cached (rarely changes)
3. **Pagination**: Alarm listing supports pagination
4. **Indexes**: Strategic indexes on common query patterns
5. **JSON Parsing**: programModules parsed only when needed

---

## Scalability Path

| Scale | Approach |
|-------|----------|
| **100s of alarms** | Current design handles efficiently |
| **1000s of alarms** | Add pagination, optimize indexes |
| **10000s of alarms** | Consider Appwrite Pro/self-hosted |
| **Multi-tenant** | Add enterprise collection, partition by enterprise |

---

## Conclusion

The normalized 5-collection design with repository pattern provides:

1. **Production-grade data integrity** through proper normalization
2. **Flexible versioning** at the alarm pattern level
3. **Complete audit trail** for compliance requirements
4. **Scalable architecture** that can grow with the system
5. **Clean separation** between data access and business logic

The initial complexity of joins is fully mitigated by the repository pattern, which provides a clean API to the service layer while handling all data composition internally.
