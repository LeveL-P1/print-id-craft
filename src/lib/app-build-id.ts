/** Baked at build time so client drafts can be invalidated after deploys. */
export const APP_BUILD_ID =
  process.env.NEXT_PUBLIC_APP_BUILD_ID || "dev-local"
