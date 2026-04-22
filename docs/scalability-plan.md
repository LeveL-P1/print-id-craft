# Scaling Strategy: 1000+ Scalable ID Card Generation

Generating 1,000+ high-resolution, print-ready ID cards directly in the browser will inevitably crash the client-side tab due to memory limits (Canvas memory limits and `jsPDF` blob bloat). To make the Print ID Craft application truly scalable, we must move heavy generations to a server-side asynchronous job runner.

## 1. Architectural Approach

**The "Asynchronous Batch Processor" Model:**

1. **Trigger**: An admin selects 1,000+ students on the frontend dashboard and clicks "Generate PDF Print".
2. **Queueing**: The frontend makes a single POST request to the API containing the student IDs. The server creates a `PrintBatch` record in the database marking it as `PENDING`/`GENERATING`.
3. **Background Processing**: A background worker (e.g., BullMQ, Inngest, Vercel Background Functions, or a standalone Node.js cron process) picks up the job.
   - It fetches students in **chunks of 100**.
   - It runs the layout calculations.
   - It composites the canvas images using a server-side canvas library (like `canvas` or `@napi-rs/canvas`) and stitches them into a PDF using `pdf-lib` or `jsPDF` running on the server.
   - It uploads the resulting chunked PDFs to cloud storage (Supabase S3).
4. **Status Polling**: The frontend pings the batch status endpoint every 3 seconds to show progress (e.g., "Generated 400 / 1,000").
5. **Retrieval**: Once the `PrintBatch` status turns to `READY`, the user is provided a download link to a `.zip` archive containing the PDFs.

## 2. API Design Contracts (@api-design-principles)

### A. Initiate Mass Generation
**Endpoint:** `POST /api/schools/[id]/batches/bulk`
**Auth:** Manufacturer / Main Teacher (School scoped)

**Request Body:**
```json
{
  "studentIds": ["cuid_1", "cuid_2", "...", "cuid_1000"],
  "options": {
    "pageSizeKey": "A4",
    "cardPresetKey": "CR80",
    "marginMm": 10,
    "gapMm": 5,
    "includeBackside": true,
    "addCutMarks": true
  }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "batchId": "batch_cuid",
    "status": "QUEUED",
    "estimatedTimeSeconds": 120
  }
}
```

---

### B. Track Generation Progress
**Endpoint:** `GET /api/batches/[batchId]/status`
**Auth:** Read access based on `schoolId` owner.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "batchId": "batch_cuid",
    "status": "GENERATING", // Options: PENDING, GENERATING, READY, FAILED
    "totalStudents": 1000,
    "processedStudents": 450,
    "chunks": [
      {
        "chunkIndex": 1,
        "status": "COMPLETED",
        "downloadUrl": "https://supabase.../batch_cuid_part1.pdf"
      },
      {
        "chunkIndex": 2,
        "status": "COMPLETED",
        "downloadUrl": "https://supabase.../batch_cuid_part2.pdf"
      },
      {
        "chunkIndex": 3,
        "status": "GENERATING",
        "downloadUrl": null
      }
    ],
    "masterZipUrl": null // Only populated when status === "READY"
  }
}
```

---

### C. Cancel / Cleanup Batch
**Endpoint:** `DELETE /api/batches/[batchId]`
**Auth:** Same as creation.

**Use Case:** If the user notices a typo, they can cancel the ongoing background job to save server time.

## 3. Worker Node Considerations (Server-Side)

### Database Schema Updates
We're already using a `PrintBatch` model, but we should improve it:
```prisma
model PrintBatch {
  id                String   @id @default(cuid())
  schoolId          String
  status            String   /// PENDING, GENERATING, READY, FAILED, CANCELED
  totalStudents     Int 
  processedStudents Int      @default(0)
  options           Json     /// Storing the page layout specs
  masterZipUrl      String?
  // New relationship for chunks
  chunks            BatchChunk[]
}

model BatchChunk {
  id          String   @id @default(cuid())
  batchId     String
  fileUrl     String?
  status      String   /// PENDING, COMPILED
  startIndex  Int
  endIndex    Int
}
```

### Memory Optimization Rules for the Worker
1. **Never load 1,000 images into heap memory simultaneously.** 
2. Stream template images (e.g., fetch the background template ONCE, cache it in RAM during the batch run).
3. Process one page (e.g., 8 cards) -> Commit to PDF buffer -> Clear Canvas from Memory -> Proceed to next page.
4. Save intermediate PDFs every 100-200 students.

### Recommended Stack
*   **Next.js API:** Acts strictly as the orchestrator to enqueue.
*   **Background Jobs:** `Inngest` (highly integrated with Next.js Vercel) or a standalone Express/Cron worker if self-hosting via Docker/Electron.
*   **Canvas:** `npm install @napi-rs/canvas` (Faster and more reliable on server-less environments than `node-canvas`).
