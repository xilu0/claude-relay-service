# Data Model: Fix Account Group Scheduling Bug

**Feature**: 001-fix-group-scheduling
**Date**: 2026-01-09

## Overview

This document describes the existing data model relevant to account group scheduling. No new entities are introduced; this serves as reference documentation for the bug fix.

## Entities

### API Key

**Redis Key Pattern**: `apikey:{id}`
**Type**: Hash

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique identifier |
| name | string | Human-readable name |
| claudeAccountId | string | Account binding - can be: empty (shared pool), UUID (direct account), or `group:{groupId}` (group binding) |
| claudeConsoleAccountId | string | Direct Console account binding (mutually exclusive with claudeAccountId group) |
| permissions | string | Service permissions: 'all', 'claude', 'gemini', 'openai', 'droid' |
| isActive | string | 'true' or 'false' |

**Relevant Validation Rules**:
- `claudeAccountId` with `group:` prefix must reference a valid group ID
- Group assignment and direct account assignment are mutually exclusive

---

### Account Group

**Redis Key Pattern**: `account_group:{id}`
**Type**: Hash

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique identifier |
| name | string | Human-readable name |
| platform | string | Platform type: 'claude', 'gemini', 'openai', 'droid' |
| description | string | Optional description |
| createdAt | string (ISO 8601) | Creation timestamp |
| updatedAt | string (ISO 8601) | Last update timestamp |

**Derived Field** (computed, not stored):
- `memberCount`: Count of members from `account_group_members:{id}` set

---

### Group Members

**Redis Key Pattern**: `account_group_members:{groupId}`
**Type**: Set

| Value | Type | Description |
|-------|------|-------------|
| (members) | string (UUID) | Account IDs belonging to this group |

**Notes**:
- Members can be Claude OAuth accounts, Console accounts, or CCR accounts
- Account type is determined at runtime by checking existence in respective storage

---

### Claude OAuth Account

**Redis Key Pattern**: `claude:account:{id}`
**Type**: Hash

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique identifier |
| name | string | Human-readable name |
| isActive | string | 'true' or 'false' (stored as string in Redis) |
| status | string | Account status: 'active', 'error', 'blocked', 'unauthorized' |
| schedulable | string | 'true' or 'false' - whether account can be scheduled |
| priority | string | Numeric priority (higher = preferred) |

**Availability Check** (in scheduler):
- `isActive === 'true'`
- `status !== 'error' && status !== 'blocked'`
- `_isSchedulable(schedulable)` returns true

---

### Claude Console Account

**Redis Key Pattern**: `claude_console_account:{id}`
**Type**: Hash

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique identifier |
| name | string | Human-readable name |
| isActive | string | 'true' or 'false' (converted to boolean by service) |
| status | string | Account status: 'active', 'error', 'unauthorized', 'rate_limited' |
| schedulable | string | 'true' or 'false' (converted to boolean by service) |
| priority | string | Numeric priority |
| maxConcurrentTasks | string | Maximum concurrent tasks (0 = unlimited) |

**Availability Check** (in scheduler):
- `account.isActive === true` (boolean, converted by service)
- `status === 'active'`
- `_isSchedulable(schedulable)` returns true
- `currentConcurrency < maxConcurrentTasks` (if limit > 0)

---

## State Transitions

### Account Availability States

```
┌─────────────┐
│   Active    │ ◄── Normal operating state
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Unavailable States                        │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ Unauthorized│ Rate Limited│   Error     │ Not Schedulable  │
│ (status)    │ (rate limit)│ (status)    │ (schedulable)    │
└─────────────┴─────────────┴─────────────┴──────────────────┘
```

### Group Scheduling Decision Flow

```
Request with group-bound API key
            │
            ▼
    ┌───────────────┐
    │ Check sticky  │
    │   session     │
    └───────┬───────┘
            │
      ┌─────┴─────┐
      │  Exists?  │
      └─────┬─────┘
           Yes│         No
            ▼           │
    ┌───────────────┐   │
    │ Validate in   │   │
    │    group      │   │
    └───────┬───────┘   │
            │           │
      ┌─────┴─────┐     │
      │Available? │     │
      └─────┬─────┘     │
           Yes│    No   │
            ▼     ▼     ▼
    ┌─────────┐  ┌──────────────┐
    │  Use    │  │ Select from  │
    │ cached  │  │ group pool   │
    └─────────┘  └──────┬───────┘
                        │
                  ┌─────┴─────┐
                  │ Available │
                  │ accounts? │
                  └─────┬─────┘
                       Yes│    No
                        ▼     ▼
                ┌─────────┐  ┌─────────┐
                │ Select  │  │  Error  │
                │ by prio │  │ NO_AVAIL│
                └─────────┘  └─────────┘
```

## Relationships

```
API Key (1) ──────────────── (0..1) Account Group
    │                              │
    │ claudeAccountId              │ account_group_members
    │ = "group:{groupId}"          │
    │                              │
    └──────────────────────────────┤
                                   │
                                   ▼
                          (0..n) Accounts
                         ┌─────────────────┐
                         │ Claude OAuth    │
                         │ Claude Console  │
                         │ CCR             │
                         └─────────────────┘
```

## Index Structures

| Index Key | Type | Purpose |
|-----------|------|---------|
| `account_groups` | Set | All group IDs for enumeration |
| `apikeys` | Set | All API key IDs for enumeration |
| `claude:account:index` | Set | All Claude OAuth account IDs |
