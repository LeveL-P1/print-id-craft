/** Maximum students per export job (excel + photos or full archive). */
export const EXPORT_MAX_STUDENTS = 15_000

/** Default cap when client does not pass ?limit= */
export const EXPORT_DEFAULT_MAX_STUDENTS = 15_000

/** Students fetched per database page during export. */
export const EXPORT_DB_PAGE_SIZE = 500

/** Parallel photo downloads — keeps throughput high without overloading storage. */
export const EXPORT_PHOTO_CONCURRENCY = 48

/** Cap warning lines so very large exports do not balloon memory. */
export const EXPORT_MAX_WARNINGS = 300

/** ZIP deflate level for spreadsheets/json (photos use STORE). */
export const EXPORT_ZIP_COMPRESSION_LEVEL = 1
