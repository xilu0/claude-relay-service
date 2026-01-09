# Quickstart: Testing Account Group Scheduling Fix

**Feature**: 001-fix-group-scheduling
**Date**: 2026-01-09

## Prerequisites

- SSH access to production server (`cc2`)
- Redis CLI access
- Access to relay service logs

## Testing Steps

### 1. Identify Test Subjects

Find an API key assigned to a group:

```bash
ssh cc2 'redis-cli --scan --pattern "apikey:*" | while read key; do
  val=$(redis-cli HGET "$key" claudeAccountId)
  if [[ "$val" == group:* ]]; then
    name=$(redis-cli HGET "$key" name)
    echo "Key: $key | Name: $name | Group: $val"
  fi
done' | head -5
```

### 2. Verify Group Has Available Members

Get group members and check their status:

```bash
# Replace with actual group ID from step 1
GROUP_ID="899975dc-760e-4c61-8d86-87938339fb82"

# List members
ssh cc2 "redis-cli SMEMBERS account_group_members:$GROUP_ID"

# For each member, check availability
for MEMBER_ID in $(ssh cc2 "redis-cli SMEMBERS account_group_members:$GROUP_ID"); do
  echo "=== Member: $MEMBER_ID ==="

  # Try OAuth account first
  OAUTH_DATA=$(ssh cc2 "redis-cli HGET 'claude:account:$MEMBER_ID' isActive")
  if [ -n "$OAUTH_DATA" ]; then
    echo "Type: OAuth"
    ssh cc2 "redis-cli HMGET 'claude:account:$MEMBER_ID' name isActive status schedulable"
  else
    # Try Console account
    echo "Type: Console"
    ssh cc2 "redis-cli HMGET 'claude_console_account:$MEMBER_ID' name isActive status schedulable"
  fi
done
```

### 3. Monitor Logs During Request

Tail the logs while making a request:

```bash
# In terminal 1 - watch logs
ssh cc2 "docker logs -f cc-club-claude-relay-1 2>&1 | grep -E 'group|selecting|available'"

# In terminal 2 - make a request with the group-bound API key
curl -X POST https://your-relay-service/api/v1/messages \
  -H "Authorization: Bearer cr_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-5-20250929", "max_tokens": 100, "messages": [{"role": "user", "content": "Hello"}]}'
```

### 4. Expected Log Patterns

**Success case**:
```
🎯 API key {name} is bound to group {groupId}, selecting from group
👥 Selecting account from group: {groupName} (claude)
📋 Checking group member: {accountName} ({memberId}) - isActive: true, status: active, schedulable: true
🎯 Selected account from group {groupName}: {accountName} ({accountId}, claude-console)
```

**Failure case - no available accounts**:
```
🎯 API key {name} is bound to group {groupId}, selecting from group
👥 Selecting account from group: {groupName} (claude)
📋 Checking group member: {accountName} ({memberId}) - isActive: true, status: unauthorized, schedulable: false
⚠️ Account {accountName} not available: status=unauthorized, schedulable=false
❌ No available accounts in group {groupName}
```

### 5. Verify Fix Success Criteria

| Criteria | How to Verify |
|----------|---------------|
| SC-001: Routes to group members | Log shows account selected from group |
| SC-002: Logs show selection reason | Per-account check logs visible |
| SC-003: Clear error messages | Error includes group name and reason |
| SC-004: Direct assignment works | Test with non-group API key |
| SC-005: Sticky sessions work | Same session hash uses same account |

## Troubleshooting

### Problem: "Group not found" error

Check if group exists:
```bash
ssh cc2 "redis-cli HGETALL 'account_group:$GROUP_ID'"
```

### Problem: "No available accounts" but members exist

Check each member's availability:
```bash
# For Console accounts
ssh cc2 "redis-cli HMGET 'claude_console_account:$MEMBER_ID' isActive status schedulable"

# Expected: "true" "active" "true"
```

### Problem: Request uses wrong account type

Verify group platform matches account types:
```bash
ssh cc2 "redis-cli HGET 'account_group:$GROUP_ID' platform"
# Should return "claude" for Claude groups
```

## Rollback Plan

If the fix causes issues:

1. Revert the code changes
2. Deploy previous version
3. Verify service health: `curl https://your-relay-service/health`
