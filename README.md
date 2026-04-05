# Re-Museum

Re-Museum is a full-stack digital regeneration museum app:

- Users upload photos of old items
- AI analyzes the item and generates remuse ideas
- The app creates stickers and stores everything in personal halls
- Account lifecycle, AI generation, admin monitoring, feedback, and memory threads are handled server-side

## Stack

- Frontend: Vite + React 19 + TypeScript + Tailwind
- Backend: Express 5 + TypeScript
- Database: SQLite
- AI: Gemini-compatible generation via backend routes at `/api/ai/*`
- Testing: Node test runner + TSX

## Local development

### Requirements

- Node.js 20+

### Install

```bash
npm install
```

### Environment

Copy `.env.example` to `.env` and set at least:

```bash
GEMINI_API_KEY=your_real_key
JWT_SECRET=a_random_secret_with_at_least_16_characters
```

Optional values:

```bash
PORT=3000
BACKEND_PORT=3000
GEMINI_BASE_URL=https://cdn.12ai.org
GEMINI_FALLBACK_BASE_URLS=https://hk.12ai.org
ALLOW_THIRD_PARTY_GEMINI_PROXY=true
DB_PATH=./data/remuse.db
UPLOADS_DIR=./uploads
APP_BASE_URL=http://127.0.0.1:5173
EMAIL_DELIVERY_MODE=log
DAILY_GEMINI_CALL_LIMIT=40
DAILY_MEMORY_QUERY_LIMIT=24
MANAGED_UPLOAD_DELETE_GRACE_MS=60000
BACKUP_DIR=./backups
BACKUP_ALERT_EMAILS=ops@example.com
ERROR_ALERT_WEBHOOK_URL=https://example.com/hooks/remuse-errors
ERROR_ALERT_INCLUDE_WARN=false
ERROR_ALERT_COOLDOWN_MS=60000
ALERT_ENVIRONMENT=production
SMOKE_ADMIN_EMAIL=admin@example.com
# For real production email delivery:
# EMAIL_DELIVERY_MODE=resend
# RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
# MAIL_FROM_EMAIL=no-reply@example.com
# MAIL_FROM_NAME=Re-Museum
```

Email verification and password reset are built in.
The app also records policy consent versions, supports account deletion, and provides a minimal admin console for usage monitoring and feedback.

Admin access is controlled only by `users.role` in the SQLite database. Promote an existing user with:

```bash
npm run user:set-role -- --email admin@example.com --role admin
```

- `EMAIL_DELIVERY_MODE=log` is useful for local development: the server logs the verification/reset link instead of sending an email.
- For real delivery in production, configure `APP_BASE_URL`, `EMAIL_DELIVERY_MODE=resend`, `RESEND_API_KEY`, and `MAIL_FROM_EMAIL`.
- The project defaults back to the original `12ai` Gemini proxy. In production you must keep `ALLOW_THIRD_PARTY_GEMINI_PROXY=true` when using it.
- Configure `ERROR_ALERT_WEBHOOK_URL` to forward server errors and browser crash reports to Slack, Discord, Feishu/Lark, or a generic webhook receiver.
- `BACKUP_ALERT_EMAILS` is only for backup failure notifications and no longer controls admin access.
- `SMOKE_ADMIN_EMAIL` is only for the production smoke script and must point to a user whose `users.role` is already `admin`.
- Registration now sends a verification email automatically.
- The login screen now supports forgot-password and reset-password flows.

### Start

```bash
npm run dev
```

This starts:

- Vite dev server at `http://127.0.0.1:5173`
- Express API server at `http://127.0.0.1:3000`

In development, Vite proxies all `/api/*` requests to the backend, including protected upload assets at `/api/uploads/*`.

You can also start them separately:

```bash
npm run dev:client
npm run dev:server
```

## Production build

Build the frontend:

```bash
npm run build
```

Run API regression tests:

```bash
npm test
```

Create a filesystem backup snapshot:

```bash
npm run backup:data
```

Run the production backup job with retention cleanup and failure alerts:

```bash
npm run backup:job
```

Restore a snapshot into a target root directory:

```bash
npm run restore:data -- ./backups/<snapshot-name> ./restore-target
```

Start the production server:

```bash
npm run server
```

Or use PM2:

```bash
pm2 start ecosystem.config.cjs
```

## Alibaba Cloud deployment notes

For an Alibaba Cloud ECS deployment, the usual setup is:

1. Run the app on `PORT=3000`
2. Put Nginx in front of it on `80/443`
3. Proxy all requests to `http://127.0.0.1:3000`
4. Keep `uploads/` and `data/` on persistent disk
5. Schedule `npm run backup:job` via cron/systemd timer
6. Keep `.env` on the server only; do not deploy local `.env`

The Express server already serves:

- built frontend files from `dist/`
- protected uploaded assets through `/api/uploads/*` backed by `uploads/`
- all `/api/*` routes

So Nginx only needs reverse proxying and TLS termination.
