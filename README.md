# Re-Museum

Re-Museum is a full-stack digital regeneration museum app:

- Users upload photos of old items
- AI analyzes the item and generates remuse ideas
- The app creates stickers and stores everything in personal halls

## Stack

- Frontend: Vite + React 19 + TypeScript + Tailwind
- Backend: Express 5 + TypeScript
- Database: SQLite
- AI: Gemini via backend proxy at `/api/gemini`

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
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
DB_PATH=./data/remuse.db
UPLOADS_DIR=./uploads
```

### Start

```bash
npm run dev
```

This starts:

- Vite dev server at `http://127.0.0.1:5173`
- Express API server at `http://127.0.0.1:3000`

In development, Vite proxies these paths to the backend:

- `/api/auth`
- `/api/items`
- `/api/stickers`
- `/api/halls`
- `/api/gemini`
- `/uploads`

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

The Express server already serves:

- built frontend files from `dist/`
- uploaded files from `uploads/`
- all `/api/*` routes

So Nginx only needs reverse proxying and TLS termination.
