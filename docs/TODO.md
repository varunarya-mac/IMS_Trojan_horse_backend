# IoT Alarm Flow Management Backend - Implementation Tasks

## Phase 1: Project Setup

### 1.1 Initialize Project
- [ ] Create Node.js/TypeScript project with `npm init`
- [ ] Install dependencies:
  - `node-appwrite` - Appwrite SDK
  - `typescript` - TypeScript compiler
  - `@types/node` - Node.js type definitions
  - `zod` - Runtime validation
  - `dotenv` - Environment variables
- [ ] Configure `tsconfig.json` for ES modules
- [ ] Create `.env` file with Appwrite credentials:
  - `APPWRITE_ENDPOINT`
  - `APPWRITE_PROJECT_ID`
  - `APPWRITE_API_KEY`
  - `APPWRITE_DATABASE_ID`

### 1.2 Create Folder Structure
```
/backend
  /functions                    # Appwrite Cloud Functions
    /import-config
    /get-disciplines
    /get-alarm-flows
    /get-alarm-pattern
    /update-alarm-pattern
    /create-alarm-pattern
    /delete-alarm-pattern
    /get-alarm-versions
    /rollback-alarm
    /get-classes
    /update-class

  /lib                          # Shared libraries
    /types
      entities.ts               # Database entity interfaces
      dtos.ts                   # API response types
      requests.ts               # API request types
      program-modules.ts        # Program module type definitions

    /repositories
      base.repository.ts        # Base repository class
      discipline.repository.ts
      alarm-flow.repository.ts
      class.repository.ts

    /services
      import.service.ts         # JSON parsing & import
      versioning.service.ts     # Version management
      audit.service.ts          # Audit trail

    /utils
      db.ts                     # Database connection
      parser.ts                 # JSON parsing utilities
      validation.ts             # Input validation schemas
      errors.ts                 # Custom error classes

  /scripts
    setup-database.ts           # Create collections & indexes
    seed-data.ts                # Import initial JSON files
```

---

## Phase 2: Database Setup (Appwrite Cloud)

### 2.1 Create Database
- [ ] Log into Appwrite Cloud console
- [ ] Create new database: `iot_alarm_management`
- [ ] Note the database ID for environment variables

### 2.2 Create Collections

#### Collection: `disciplines`
- [ ] Create collection with attributes:
  | Attribute | Type | Required | Array |
  |-----------|------|----------|-------|
  | name | string (128) | Yes | No |
  | enterpriseName | string (64) | Yes | No |
  | enterpriseVersion | integer | Yes | No |
  | createdAt | datetime | Yes | No |
  | updatedAt | datetime | Yes | No |
- [ ] Create indexes:
  - `idx_name` - unique on `name`
  - `idx_enterprise_name` - on `enterpriseName, name`

#### Collection: `discipline_types`
- [ ] Create collection with attributes:
  | Attribute | Type | Required | Array |
  |-----------|------|----------|-------|
  | disciplineId | string (36) | Yes | No |
  | name | string (128) | Yes | No |
  | createdAt | datetime | Yes | No |
- [ ] Create indexes:
  - `idx_discipline_name` - unique on `disciplineId, name`
  - `idx_name` - on `name`

#### Collection: `alarm_patterns`
- [ ] Create collection with attributes:
  | Attribute | Type | Required | Array |
  |-----------|------|----------|-------|
  | disciplineTypeId | string (36) | Yes | No |
  | alarmPatternKey | string (256) | Yes | No |
  | version | integer | Yes | No |
  | isLatest | boolean | Yes | No |
  | no | integer | Yes | No |
  | alarmId | string (128) | Yes | No |
  | textExpr | string (512) | Yes | No |
  | genericFamily | string (64) | Yes | No |
  | genericId | string (128) | Yes | No |
  | trapPdu1 | string (128) | Yes | No |
  | trapFlag | integer | Yes | No |
  | suppressionPeriod | float | Yes | No |
  | programModules | string (1000000) | No | No |
  | createdAt | datetime | Yes | No |
  | createdBy | string (36) | No | No |
  | changeDescription | string (512) | No | No |
- [ ] Create indexes:
  - `idx_type_latest` - on `disciplineTypeId, isLatest`
  - `idx_key_latest` - on `alarmPatternKey, isLatest`
  - `idx_key` - on `alarmPatternKey`
  - `idx_created_by` - on `createdBy`

#### Collection: `classes`
- [ ] Create collection with attributes:
  | Attribute | Type | Required | Array |
  |-----------|------|----------|-------|
  | disciplineTypeId | string (36) | Yes | No |
  | classId | string (64) | Yes | No |
  | description | string (256) | Yes | No |
  | defaultFlag | integer | Yes | No |
  | data | string (100000) | No | No |
  | patterns | string (100000) | No | No |
  | createdAt | datetime | Yes | No |
- [ ] Create indexes:
  - `idx_type` - on `disciplineTypeId`
  - `idx_class` - on `classId`

#### Collection: `fields` (Optional)
- [ ] Create collection with attributes:
  | Attribute | Type | Required | Array |
  |-----------|------|----------|-------|
  | disciplineTypeId | string (36) | Yes | No |
  | name | string (128) | Yes | No |
  | arrayType | string (256) | No | No |
  | arraySize | integer | No | No |
  | fieldType1 | string (64) | No | No |
  | fieldType2 | string (64) | No | No |
  | createdAt | datetime | Yes | No |
- [ ] Create indexes:
  - `idx_type` - on `disciplineTypeId`

---

## Phase 3: TypeScript Types & Utilities

### 3.1 Entity Types (`/lib/types/entities.ts`)
- [ ] Define `Discipline` interface
- [ ] Define `DisciplineType` interface
- [ ] Define `AlarmPattern` interface
- [ ] Define `DeviceClass` interface
- [ ] Define `Field` interface

### 3.2 DTO Types (`/lib/types/dtos.ts`)
- [ ] Define `DisciplineDTO` (API response)
- [ ] Define `DisciplineTypeDTO`
- [ ] Define `AlarmFlowDTO` (includes parsed programModules)
- [ ] Define `AlarmVersionDTO`
- [ ] Define `ClassDTO`

### 3.3 Request Types (`/lib/types/requests.ts`)
- [ ] Define `ImportConfigRequest`
- [ ] Define `UpdateAlarmPatternRequest`
- [ ] Define `CreateAlarmPatternRequest`
- [ ] Define `RollbackRequest`
- [ ] Define `UpdateClassRequest`

### 3.4 Program Module Types (`/lib/types/program-modules.ts`)
- [ ] Define `ProgramModule` interface
- [ ] Define `ProgramModuleType` enum (0-39)
- [ ] Define input/output interfaces for each module type
- [ ] Create type guards for module validation

### 3.5 Validation Schemas (`/lib/utils/validation.ts`)
- [ ] Create Zod schema for `AlarmPattern`
- [ ] Create Zod schema for `ProgramModule`
- [ ] Create Zod schema for update requests
- [ ] Create Zod schema for create requests

---

## Phase 4: Data Access Layer (Repositories)

### 4.1 Base Repository (`/lib/repositories/base.repository.ts`)
- [ ] Create abstract `BaseRepository` class
- [ ] Implement common CRUD methods
- [ ] Add pagination helper
- [ ] Add query builder helpers

### 4.2 Discipline Repository (`/lib/repositories/discipline.repository.ts`)
- [ ] `findAll()` - Get all disciplines
- [ ] `findById(id)` - Get single discipline
- [ ] `findByName(name)` - Get by name
- [ ] `create(data)` - Create discipline
- [ ] `update(id, data)` - Update discipline

### 4.3 Alarm Flow Repository (`/lib/repositories/alarm-flow.repository.ts`)
- [ ] `findLatestByDisciplineType(typeId)` - Get all latest alarms
- [ ] `findByAlarmPatternKey(key)` - Get latest version
- [ ] `findVersionHistory(key)` - Get all versions
- [ ] `findSpecificVersion(key, version)` - Get specific version
- [ ] `createVersion(data)` - Create new version
- [ ] `setNotLatest(id)` - Update isLatest flag
- [ ] `getAlarmFlowsWithContext(typeId)` - Compose full DTO with joins

### 4.4 Class Repository (`/lib/repositories/class.repository.ts`)
- [ ] `findByDisciplineType(typeId)` - Get all classes
- [ ] `findById(id)` - Get single class
- [ ] `create(data)` - Create class
- [ ] `update(id, data)` - Update class

---

## Phase 5: Business Logic (Services)

### 5.1 Import Service (`/lib/services/import.service.ts`)
- [ ] `parseJsonFile(content)` - Parse JSON structure
- [ ] `extractDisciplines(json)` - Extract discipline records
- [ ] `extractDisciplineTypes(json)` - Extract type records
- [ ] `extractAlarmPatterns(json)` - Extract alarm records
- [ ] `extractClasses(json)` - Extract class records
- [ ] `importAll(json)` - Orchestrate full import
- [ ] Handle both JSON files:
  - `json-fixer.json` (HVAC, Energy, Fuel, Hot Counter)
  - `json-fixer_refrigeration.json` (Refrigeration)

### 5.2 Versioning Service (`/lib/services/versioning.service.ts`)
- [ ] `createNewVersion(key, data, userId, description)` - Create version
- [ ] `getLatestVersion(key)` - Get current version
- [ ] `rollbackToVersion(key, targetVersion, userId)` - Rollback
- [ ] `getVersionHistory(key)` - Get all versions
- [ ] `softDelete(key, userId)` - Mark as deleted

### 5.3 Audit Service (`/lib/services/audit.service.ts`)
- [ ] `logChange(alarmKey, userId, action, description)` - Log audit
- [ ] `getAuditTrail(alarmKey)` - Get audit history
- [ ] `generateChangeDescription(oldData, newData)` - Auto-generate description

---

## Phase 6: API Functions

### 6.1 Import Config (`/functions/import-config`)
- [ ] Create function entry point
- [ ] Validate JSON input
- [ ] Call import service
- [ ] Return import summary (counts, errors)

### 6.2 Get Disciplines (`/functions/get-disciplines`)
- [ ] Create function entry point
- [ ] Fetch all disciplines with types
- [ ] Format response

### 6.3 Get Alarm Flows (`/functions/get-alarm-flows`)
- [ ] Create function entry point
- [ ] Validate disciplineTypeId parameter
- [ ] Fetch latest alarms with context
- [ ] Parse programModules JSON
- [ ] Format response

### 6.4 Get Alarm Pattern (`/functions/get-alarm-pattern`)
- [ ] Create function entry point
- [ ] Validate alarmPatternKey parameter
- [ ] Fetch latest or specific version
- [ ] Format response

### 6.5 Update Alarm Pattern (`/functions/update-alarm-pattern`)
- [ ] Create function entry point
- [ ] Validate request body
- [ ] Validate programModules structure
- [ ] Call versioning service
- [ ] Return new version

### 6.6 Create Alarm Pattern (`/functions/create-alarm-pattern`)
- [ ] Create function entry point
- [ ] Validate request body
- [ ] Generate alarmPatternKey
- [ ] Create with version=1, isLatest=true
- [ ] Return created alarm

### 6.7 Delete Alarm Pattern (`/functions/delete-alarm-pattern`)
- [ ] Create function entry point
- [ ] Validate alarmPatternKey
- [ ] Soft delete (set isLatest=false for all versions)
- [ ] Return success response

### 6.8 Get Alarm Versions (`/functions/get-alarm-versions`)
- [ ] Create function entry point
- [ ] Validate alarmPatternKey
- [ ] Fetch all versions ordered by version DESC
- [ ] Format response with audit info

### 6.9 Rollback Alarm (`/functions/rollback-alarm`)
- [ ] Create function entry point
- [ ] Validate request (key + targetVersion)
- [ ] Verify target version exists
- [ ] Create new version copying target data
- [ ] Return new version

### 6.10 Get Classes (`/functions/get-classes`)
- [ ] Create function entry point
- [ ] Validate disciplineTypeId
- [ ] Fetch classes
- [ ] Parse JSON data fields
- [ ] Format response

### 6.11 Update Class (`/functions/update-class`)
- [ ] Create function entry point
- [ ] Validate request body
- [ ] Update class record
- [ ] Return updated class

---

## Phase 7: Testing

### 7.1 Unit Tests
- [ ] Test JSON parser with sample data
- [ ] Test versioning service logic
- [ ] Test repository methods (mocked DB)
- [ ] Test validation schemas

### 7.2 Integration Tests
- [ ] Test import flow end-to-end
- [ ] Test CRUD operations on alarms
- [ ] Test version creation and rollback
- [ ] Test query patterns

### 7.3 Manual Testing
- [ ] Import `json-fixer.json`
- [ ] Import `json-fixer_refrigeration.json`
- [ ] Verify all disciplines created
- [ ] Verify all alarm_patterns with version=1
- [ ] Test update flow (version increment)
- [ ] Test rollback flow
- [ ] Test version history retrieval

---

## Phase 8: Deployment

### 8.1 Appwrite Cloud Deployment
- [ ] Configure function domains
- [ ] Set environment variables in Appwrite console
- [ ] Deploy all functions
- [ ] Test endpoints via Appwrite console

### 8.2 Documentation
- [ ] Document API endpoints with examples
- [ ] Create Postman/Insomnia collection
- [ ] Document error codes and responses

---

## Implementation Priority Order

| Priority | Task | Dependencies |
|----------|------|--------------|
| 1 | Project setup & folder structure | None |
| 2 | Create database collections | Project setup |
| 3 | TypeScript types | Database schema |
| 4 | Base repository | TypeScript types |
| 5 | Import service + JSON parser | Repositories |
| 6 | import-config function | Import service |
| 7 | get-disciplines function | Discipline repository |
| 8 | get-alarm-flows function | Alarm repository |
| 9 | Versioning service | Alarm repository |
| 10 | update-alarm-pattern function | Versioning service |
| 11 | get-alarm-versions function | Alarm repository |
| 12 | rollback-alarm function | Versioning service |
| 13 | create-alarm-pattern function | Alarm repository |
| 14 | delete-alarm-pattern function | Alarm repository |
| 15 | get-classes function | Class repository |
| 16 | Testing & deployment | All functions |

---

## Notes

### JSON File Locations
- `/Users/varun.arya/Desktop/IMS_trojan_horse/json-fixer.json`
- `/Users/varun.arya/Desktop/IMS_trojan_horse/json-fixer_refrigeration.json`

### Appwrite MCP
Use Appwrite Cloud MCP to generate code for:
- Database collection creation
- Function scaffolding
- SDK integration

### Key Decisions
- Versioning at alarm_pattern level (not discipline_type)
- Normalized schema with 5 collections
- Repository pattern for join handling
- Full audit trail with userId, timestamp, description
