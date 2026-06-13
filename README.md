# WiseMelon

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
JOB_WORKER_URL=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

`CRON_SECRET` secures cron and worker calls (`Authorization: Bearer ...`). Required in production when Vercel crons are enabled.
`JOB_WORKER_URL` is optional. Set it to a dedicated Node worker host when heavy PDF/ZIP/photo jobs should run outside Vercel; otherwise the app wakes its own `/api/jobs/process` route.

## Vercel Pro + Supabase Pro (recommended for season)

This repo ships **Pro-ready** settings in `vercel.json`:

- Job worker cron every 2 minutes: `GET /api/jobs/process`
- Daily maintenance: `GET /api/maintenance/cleanup`
- Weekly platform metadata backup: `GET /api/admin/backup/scheduled` (Sunday 03:00 UTC)

Function timeouts: job worker **300s**; most API routes **60s**.

### Supabase dashboard (after upgrading to Pro)

1. Enable **daily backups** (and optional **PITR** for point-in-time recovery).
2. Confirm bucket `student-photos` exists and is accessible with the service role.
3. Run `npx prisma db push` once after deploy if `EXPORT_PLATFORM_BACKUP` was added to the `JobType` enum.

### Backup strategy (no data loss)

| Layer | What | How |
|-------|------|-----|
| Database | Postgres rows | Supabase Pro daily backups + optional PITR |
| Metadata JSON | Users, schools, classes, templates, students, batches | Weekly cron → `student-photos/backups/platform/*.json` |
| Photos / PDFs / ZIPs | Binary files in Storage | Per-school **Complete Archive ZIP** exports; copy to external drive weekly |
| Manual snapshot | Full JSON download | Manufacturer: `GET /api/admin/export-db` (paginated; use `?students=false` for metadata-only) |
| On-demand cloud backup | Same as weekly job | Manufacturer: `POST /api/admin/backup/run` |

Check backup health: `GET /api/admin/backup/status` (manufacturer session).

Manual weekly backup trigger:

```bash
curl -X POST https://your-domain/api/admin/backup/run \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{"includeStudents":true}'
```

Or rely on the Sunday cron (uses `CRON_SECRET` like other maintenance routes).

### Vercel Hobby note

Scheduled crons and 300s durations require **Vercel Pro**. On Hobby, remove the `crons` block from `vercel.json` and call maintenance/backup endpoints manually; jobs still run when enqueued via immediate worker kick.

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

Vercel Pro runs these crons automatically (see `vercel.json`):

```text
GET /api/maintenance/cleanup        (daily 02:00 UTC)
GET /api/jobs/process               (every 2 minutes)
GET /api/admin/backup/scheduled     (Sunday 03:00 UTC)
```

On **Vercel Hobby**, call the same endpoints manually (no scheduled cron):

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
GET /api/admin/backup/status
POST /api/admin/backup/run
GET /api/admin/export-db
```

Manufacturer session required.
The manufacturer dashboard also includes a compact Operations panel showing
readiness, recent backend events, and recent jobs.

`Job` records track background work: archive exports, QR generation after import, print batch PDF generation, and platform metadata backups. On Pro, crons in `vercel.json` process the queue every 2 minutes. On Hobby, the worker runs when jobs are enqueued (not on a schedule).

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
