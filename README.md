# WiseMelon

## Overview

WiseMelon is a production-grade portal for school ID card registration, verification, and batch manufacturing.

The system supports:
- Manufacturer setup of schools, classes, ID templates, and print batches.
- Public student/parent registration with photo upload, background processing, and QR generation.
- Teacher verification and review workflows.
- Export of student data as CSV, Excel, and complete archive ZIP packages.
- Background job processing for heavy tasks, including PDF generation and archive exports.

This repository is built with Next.js 16, Prisma, Supabase, and Vercel-ready deployment configuration.

## Key Features

- School and class management
- Template-driven ID card layout builder
- Public registration link for students and parents
- Photo upload with optional background removal and processing
- Teacher/MANUFACTURER review and comment workflows
- Export: CSV, Excel, ZIP archive with photos, QR codes, and metadata
- Background worker queue powered by `/api/jobs/process`
- Production-ready Vercel cron jobs and security headers
- Supabase storage integration with private media support

## Architecture

- Frontend: `Next.js` app using server components and React client components
- Database: `PostgreSQL` via `Prisma` ORM
- Auth: `next-auth` powered sessions for manufacturer and teacher roles
- Storage: `Supabase` object storage for student photos and exported assets
- Background processing: Vercel cron and job queue pattern with `Job` records
- Monitoring: optional `Sentry` integration

## System Model

1. Manufacturer creates a school, staff accounts, classes, and ID templates.
2. Parents/students submit details and photos through a school registration link.
3. Teachers and manufacturers verify submissions and resolve photo issues.
4. Manufacturer exports CSV/Excel/ZIP archives and prints batches from the dashboard.

## Required Environment Variables

Create a local `.env` or `.env.local` file and include the following:

```env
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
JOB_WORKER_URL=
BG_REMOVAL_SERVICE_URL=https://teamsasd-wisemelon-bg-removal.hf.space
BG_REMOVAL_SERVICE_TOKEN=
BG_REMOVAL_MODEL=birefnet-portrait
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

Notes:
- `CRON_SECRET` secures scheduled/maintenance routes and worker calls.
- `JOB_WORKER_URL` is optional; set it when using a dedicated worker host.
- `BG_REMOVAL_SERVICE_URL` is optional; set it to the Railway/FastAPI rembg service URL for professional BiRefNet portrait background removal with automatic `u2net_human_seg` mask merge (fills hair/shirt holes). The browser falls back to local ISNet when it is not configured.
- `NEXTAUTH_SECRET` is required for session security.

## Local Setup

```bash
git clone <repo-url>
cd print-id-craft
npm install --legacy-peer-deps
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000` to access the application.

## Database

The app uses Prisma with a PostgreSQL datasource. The schema includes core models such as:
- `User` (MANUFACTURER, TEACHER)
- `School`
- `Class`
- `Template`
- `Student`
- `Job`
- `SystemEvent`
- `RateLimit`

Run database preparation commands:

```bash
npm run db:push
npm run db:prepare-live
npm run db:reset
```

## Scripts

Useful npm commands:

```bash
npm run dev
npm run build
npm start
npm run lint
npm test
npm test:watch
npm test:ci
npm test:e2e
npm run load:submit
npm run load:full
npm run seed
npm run db:push
npm run db:migrate:create
npm run db:migrate:deploy
npm run db:prepare-live
npm run db:reset
npm run db:use:mysql
npm run db:use:postgres
npm run desktop
npm run desktop:build
```

## Deployment

This repository is configured for Vercel with `vercel.json`.

Important production endpoints and schedules:

- `GET /api/jobs/process` — job queue processing (every 2 minutes)
- `GET /api/maintenance/cleanup` — daily cleanup and retention pruning
- `GET /api/admin/backup/scheduled` — weekly metadata backup

If deploying on Vercel Hobby, remove the `crons` section from `vercel.json` and invoke maintenance endpoints manually.

## Supabase Storage & Media

The app expects a Supabase storage bucket named `student-photos`.

The system stores:
- `photoUrl`: current display URL
- `photoPath`: durable storage path for signed URLs and archive downloads

For private buckets, media is served through the app via secure media routes.

## Exports

Manufacturer exports support:
- CSV
- Excel
- Complete Archive ZIP

Archive structure includes:

```text
students/students.csv
students/students.json
photos/
qr/
print/
school.json
manifest.json
```

Export constraints:
- default max: 1500 students
- hard max: 3000 students
- use class/status filters for larger schools
- use `photos=false` for metadata-only exports

## Monitoring & Maintenance

Enable Sentry with:

```env
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

Maintenance endpoints:

```text
POST /api/maintenance/cleanup
POST /api/admin/backup/run
GET /api/admin/backup/status
GET /api/admin/events
GET /api/admin/jobs
GET /api/admin/export-db
```

Manual maintenance example:

```bash
curl -X POST https://your-domain/api/maintenance/cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Backup Strategy

Recommended backup layers:
- Database backups via Supabase daily backups/PITR
- Weekly JSON metadata exports via scheduled backup job
- Complete per-school ZIP archives for photos, print assets, and metadata
- Manual `GET /api/admin/export-db` snapshots as needed

## Load Testing

Use the provided load scripts for staging validation:

```bash
LOAD_TARGET=https://your-staging-domain \
LOAD_TOKEN=class-or-school-token \
LOAD_TOTAL=1000 \
LOAD_CONCURRENCY=25 \
npm run load:submit
```

```bash
LOAD_TARGET=https://your-staging-domain \
LOAD_TOKEN=class-or-school-token \
LOAD_TOTAL=1000 \
LOAD_CONCURRENCY=20 \
LOAD_WITH_PHOTOS=1 \
npm run load:full
```

Use staging data only; these scripts generate real student submissions.

## Best Practices

- Keep `CRON_SECRET` and Supabase service keys out of source control
- Use Vercel Pro for scheduled cron execution and longer function timeouts
- Validate builds with `npx tsc --noEmit` and `npm run lint`
- Regularly export backups and verify storage access

## Notes

- Custom webpack is required for WASM/ONNX support in Next.js production
- The app uses optimized remote patterns for Supabase-hosted images
- Background jobs are tracked through the `Job` table and can be polled for completion
- The repository also includes Electron desktop launch commands for local desktop workflows
