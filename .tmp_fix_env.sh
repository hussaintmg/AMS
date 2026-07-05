#!/bin/bash
# Fix ALL production .env settings that got overwritten by git reset --hard
ENV_FILE="/www/wwwroot/erpoj.com/.env"

echo "=== Current broken .env (DB + CORS) ==="
grep -E 'DB_USER|DB_PASSWORD|DB_NAME|CORS_ORIGIN' "$ENV_FILE"

echo ""
echo "=== Fixing DB credentials ==="
sed -i 's|DB_USER=root|DB_USER=sql_erpoj_com|' "$ENV_FILE"
sed -i 's|DB_NAME=ams_db|DB_NAME=sql_erpoj_com|' "$ENV_FILE"
# Use python to handle the password with special chars safely
python3 -c The plan is approved with a few mandatory improvements before implementation.

## 1. Runtime API Versioning

Do not expose APIs directly.

Everything should be under:

/api/v1/

Example:

/api/v1/providers

/api/v1/provider-accounts

/api/v1/tasks

/api/v1/schedules

/api/v1/dashboard

/api/v1/logs

/api/v1/chat

This avoids breaking the Website in future versions.

---

## 2. Dashboard Live Updates

Do not rely only on polling.

Design the Dashboard so it supports WebSocket or Server-Sent Events later.

Every page should be written so live updates can be plugged in without rewriting the UI.

Examples:

Running Tasks

Provider Health

Logs

Runtime Status

Progress

Charts

Initially polling is acceptable, but architecture must support real-time updates.

---

## 3. Provider Account Management

The Providers page must have three levels.

Category

↓

Provider

↓

Provider Accounts

Do not mix Provider configuration with Provider Account configuration.

Provider Account should display:

API Key

Health

Cooldown

Usage

Quota

Priority

Weight

Rotation

Errors

Latency

Last Success

Last Failure

Provider configuration should remain separate.

---

## 4. Runtime Assistant

The Chat page should support future function calling.

The Runtime Assistant must be capable of:

Reading Runtime state

Searching logs

Searching tasks

Searching schedules

Searching providers

Searching agents

Searching tools

Explaining failures

It must NEVER modify Runtime state unless explicit write tools are added later.

Design the assistant with read-only architecture.

---

## 5. Task Detail Page

Tasks page should have two views.

List View

Task Detail View

Task Detail should show:

Execution Timeline

Provider Used

Provider Account Used

Agent

Sub Agent

Tools

Retries

Fallbacks

Logs

Latency

Output

Memory References

Execution Graph

This will become extremely useful for debugging.

---

## 6. Scheduler History

Scheduler should not only show schedules.

It must also show:

Execution History

Success Count

Failure Count

Average Duration

Next Execution

Last Execution

Linked Runtime Tasks

This relationship is important.

---

## 7. Logs

Logs should support:

Search

Filtering

Grouping

Download

Export

Pagination

Correlation IDs

Every Runtime execution should have a correlation ID so all related logs can be traced together.

---

## 8. UI Design Rule

Every page should be modular.

No page should contain large business logic.

Structure:

Page

↓

Container

↓

Components

↓

Hooks

↓

Runtime API Client

↓

Runtime

This keeps future mobile apps reusable.

---

## FINAL APPROVAL

After applying these adjustments, proceed with implementation.

Do not merge everything in one commit.

Complete one section at a time:

1. Runtime APIs

2. Runtime Authentication

3. Runtime API Client

4. Dashboard

5. Providers

6. Agents

7. Tasks

8. Scheduler

9. Chat

10. Logs

11. Settings

12. Responsive QA

Each section must be fully working before moving to the next.

import re
with open('$ENV_FILE', 'r') as f:
    content = f.read()
content = re.sub(r'DB_PASSWORD=.*', 'DB_PASSWORD=\"7@e7c9!93d#b5\$138\"', content)
with open('$ENV_FILE', 'w') as f:
    f.write(content)
print('DB_PASSWORD fixed')
"

echo "=== Fixing CORS_ORIGIN ==="
sed -i 's|CORS_ORIGIN=http://localhost:3000,http://localhost:3001|CORS_ORIGIN=https://erpoj.com,https://www.erpoj.com,http://localhost:3000,http://localhost:3001|' "$ENV_FILE"

echo ""
echo "=== Fixed .env ==="
grep -E 'DB_USER|DB_PASSWORD|DB_NAME|CORS_ORIGIN' "$ENV_FILE"

echo ""
echo "=== Restarting ams-api ==="
pm2 restart ams-api
sleep 3

echo "=== API Status ==="
pm2 show ams-api | grep -E 'status|uptime'

echo "=== Health Check ==="
curl -s http://localhost:3002/api/health
echo ""
echo "=== ALL DONE ==="
