import { expect, test } from "@playwright/test"
import sharp from "sharp"

const token = "e2e-submit-token"

async function studentPhotoFixture() {
  const svg = `
    <svg width="720" height="960" xmlns="http://www.w3.org/2000/svg">
      <rect width="720" height="960" fill="#ffffff"/>
      <ellipse cx="360" cy="710" rx="205" ry="170" fill="#1d4ed8"/>
      <rect x="265" y="515" width="190" height="185" rx="46" fill="#f2c29b"/>
      <circle cx="360" cy="360" r="145" fill="#f2c29b"/>
      <path d="M220 330 Q360 150 500 330 Q470 210 360 205 Q250 210 220 330Z" fill="#2f1b12"/>
      <circle cx="310" cy="365" r="16" fill="#1f2937"/>
      <circle cx="410" cy="365" r="16" fill="#1f2937"/>
      <path d="M325 440 Q360 470 395 440" stroke="#7f1d1d" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M265 650 L360 730 L455 650 L455 760 L265 760Z" fill="#ffffff"/>
    </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer()
}

test.beforeEach(async ({ page }) => {
  await page.route(`**/api/submit/${token}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          schoolName: "E2E School",
          schoolLogo: null,
          className: "Pre Primary",
          schoolId: "school_e2e",
          classId: "class_e2e",
          photoBgColor: "#FFFFFF",
          templateImageUrl: null,
          fieldMappings: [],
          cardWidthMm: 85.6,
          cardHeightMm: 54,
          orientation: "PORTRAIT",
          fixedBranch: "",
          flagColors: [],
          fieldConfig: [
            { key: "fullName", label: "Name", type: "text", required: true, role: "name" },
            { key: "fatherName", label: "Father Name", type: "text", required: true, role: "father" },
            { key: "mobile", label: "Father No.", type: "tel", required: true, role: "mobile" },
            { key: "address", label: "Address", type: "textarea", required: true, role: "address" },
          ],
          frontLayout: [
            { id: "photo", type: "photo", x: 8, y: 10, width: 22, height: 30, content: "" },
            { id: "name", type: "text", x: 34, y: 12, width: 45, height: 7, content: "{{fullName}}", fontSize: 8, fill: "#111827" },
            { id: "class", type: "text", x: 34, y: 22, width: 45, height: 7, content: "{{class}}", fontSize: 7, fill: "#111827" },
          ],
          backLayout: [],
        },
      }),
    })
  })

  await page.route("**/api/upload", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        url: "https://example.supabase.co/storage/v1/object/public/student-photos/students/school_e2e/e2e.jpg",
        path: "students/school_e2e/e2e.jpg",
      }),
    })
  })

  await page.route(`**/api/submit/${token}/submit`, async (route) => {
    const body = route.request().postDataJSON()
    expect(body.photoUrl).toContain("supabase.co/storage")
    expect(body.formData.fullName).toBe("Aarav Sunil Patil")
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        success: true,
        data: { studentId: "student_e2e", serialNumber: "E2E-001" },
      }),
    })
  })
})

test("mobile parent can fill, upload photo, preview template, and submit on slow upload", async ({ page }) => {
  await page.goto(`/submit/${token}`)

  await page.getByPlaceholder("e.g. Darshan Sunil Choudhari").fill("Aarav Sunil Patil")
  await page.getByPlaceholder("e.g. Ramesh Kumar Choudhari").fill("Sunil Patil")
  await page.getByPlaceholder("9876543210").fill("9876543210")
  await page.getByPlaceholder("e.g. House No 12, MG Road, Kothrud, Pune, 411038").fill(
    "Flat 9 Lotus Residency Kothrud Pune 411038"
  )
  await page.locator('form button[type="submit"]').click()

  const photo = await studentPhotoFixture()
  await page.locator('input[type="file"]').setInputFiles({
    name: "student-photo.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  })

  const cropButton = page.getByRole("button", { name: /Apply Crop/ })
  const forceButton = page.getByRole("button", { name: /Use photo anyway/ })
  await expect(cropButton.or(forceButton)).toBeVisible({ timeout: 30_000 })
  if (await forceButton.isVisible()) await forceButton.click()
  await cropButton.click()

  await expect(page.getByText("Card Preview")).toBeVisible()
  await page.getByRole("button", { name: /Submit Registration/ }).click()
  await expect(page.getByText("E2E-001")).toBeVisible({ timeout: 30_000 })
})
