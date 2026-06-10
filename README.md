# Print ID Craft

Production portal for school ID-card collection and manufacturing.

## System Model

Manufacturer creates a school, classes, and an ID template. Parents/students submit details and photos through a public registration link. Teachers and manufacturers verify records. Manufacturer exports CSV/Excel/ZIP archives and print batches.

## Required Environment

Set these in local `.env` and production hosting:

```bash
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

`CRON_SECRET` is required for the Vercel cleanup cron. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.

## Commands

```bash
npm install --legacy-peer-deps
npx prisma generate
npx prisma db push
npm run build
npm test
npm run dev
```

## Production Checks

Before deploy:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Builds validate TypeScript and lint. Warnings are allowed; errors fail deploy.

## Supabase

Storage bucket: `student-photos`

The app stores both:

- `photoUrl`: current display URL.
- `photoPath`: durable storage path used for archive downloads and future signed URLs.

For stronger privacy, move the bucket to private and serve images through:

```text
/api/media/student-photo/:studentId
```

Authenticated student APIs return this media route automatically when `photoPath`
exists, so manufacturer/teacher screens continue to work with private buckets.

## Exports

Manufacturer export tab supports:

- CSV
- Excel
- Complete Archive ZIP

Archive contents:

```text
students/students.csv
students/students.json
photos/
qr/
print/
school.json
manifest.json
```

Archive guardrails:

- default max: 1500 students
- hard max: 3000 students
- use class/status filters for larger schools
- use `photos=false` for metadata-only export

## Maintenance

Vercel cron calls:

```text
GET /api/maintenance/cleanup
```

This deletes expired rate-limit rows. It requires `CRON_SECRET` in production.
It also prunes old `SystemEvent` and completed/failed `Job` records. Retention
defaults are 90 days for events and 30 days for completed jobs; override with
`EVENT_RETENTION_DAYS` and `JOB_RETENTION_DAYS` when needed.

Manual call:

```bash
curl -X POST https://your-domain/api/maintenance/cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Monitoring

Sentry is optional but recommended. Configure:

```bash
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

The app also records important backend failures in `SystemEvent`.

Admin APIs:

```text
GET /api/admin/events
GET /api/admin/jobs
```

Manufacturer session required.
The manufacturer dashboard also includes a compact Operations panel showing
readiness, recent backend events, and recent jobs.

`Job` records track background work: archive exports, QR generation after import, and print batch PDF generation. A worker runs via Vercel cron (`/api/jobs/process` every 2 minutes) and can be kicked immediately after enqueue.

Poll job status: `GET /api/jobs/{jobId}`. Download completed archive: `GET /api/jobs/{jobId}/download`.

Worker auth uses `Authorization: Bearer $CRON_SECRET` (or `WORKER_SECRET` if set).

## Security Audit

`npm audit fix` and compatible dependency overrides have been applied. Remaining
audit items require deliberate product changes, not a blind forced update:

- `next` / bundled `postcss`: fix requires a major Next upgrade.
- `next-auth` / transitive `uuid`: forced audit path downgrades auth and should not be used.
- `xlsx`: removed; replaced with `exceljs` for import/export. Legacy `.xls` imports are no longer supported — use `.csv` or `.xlsx`.

## Recovery Notes

If a public submission spike occurs:

1. Check `/api/admin/events`.
2. Check Supabase DB and storage health.
3. Confirm `RateLimit` rows are being cleaned by cron.
4. Export affected school with `photos=false` if archive photo export is too large.
5. Use class/status filters for ZIP archive chunks.

## Load Testing

Controlled public-submit test against a staging school/class link:

```bash
LOAD_TARGET=https://your-staging-domain \
LOAD_TOKEN=class-or-school-token \
LOAD_TOTAL=1000 \
LOAD_CONCURRENCY=25 \
npm run load:submit
```

Full test with optional photo uploads and separate upload/submit latency metrics (up to 3000 students):

```bash
LOAD_TARGET=https://your-staging-domain \
LOAD_TOKEN=class-or-school-token \
LOAD_TOTAL=1000 \
LOAD_CONCURRENCY=20 \
LOAD_WITH_PHOTOS=1 \
npm run load:full
```

Set `LOAD_MODE=school` for school-wide submit links. Use staging data only; the
script creates real student submissions.

## Current Architecture Ceiling

This stack is suitable for 1000+ submissions with bounded exports. Very large PDF/ZIP jobs should eventually move to a dedicated queue/worker using the existing `Job` table.
