/**
 * Google Gemini (Imagen) background replacement for student ID photos.
 *
 * Uses the gemini-3.1-flash-image model to perform high-quality portrait
 * background replacement with proper alpha matting for hair, maintaining
 * fine strand details that ISNet/rembg models typically lose.
 *
 * Server-side only — requires GEMINI_API_KEY in env.
 */

import { GoogleGenAI } from "@google/genai"

/** Timeout for the Gemini API call (ms). */
const GEMINI_TIMEOUT_MS = 60_000

/** Maximum image dimension sent to Gemini (pixels). */
const MAX_INPUT_DIM = 1024

/**
 * Validate that the Gemini API key is configured.
 */
export function isGeminiConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY?.trim())
}

/**
 * Build the prompt for background replacement.
 * The prompt is carefully tuned to preserve the subject exactly as-is
 * while only changing the background color.
 */
function buildBgReplacementPrompt(bgColorHex: string): string {
  return [
    `You are a professional photo editor for school ID card portraits.`,
    ``,
    `TASK: Replace the background of this portrait photo with a solid color ${bgColorHex}.`,
    ``,
    `CRITICAL RULES:`,
    `- Keep the person EXACTLY as they appear — do NOT change their face, expression, clothing, skin tone, or any body features`,
    `- Preserve ALL fine hair details — individual strands, wispy edges, flyaways — use soft alpha matting`,
    `- The background must be a perfectly uniform solid color ${bgColorHex} everywhere behind the person`,
    `- Maintain natural-looking edges between the person and the new background — NO harsh cutouts, NO "helmet hair" effect`,
    `- The transition from hair to background should be smooth and natural with subtle translucency at the edges`,
    `- Do NOT crop, resize, or reframe the photo — keep the exact same composition`,
    `- Do NOT add any text, watermarks, borders, or decorations`,
    `- The output should look like a professional ID card photo taken in front of a ${bgColorHex} backdrop`,
    ``,
    `Return ONLY the edited image, no text.`,
  ].join("\n")
}

export type GeminiBgResult = {
  /** The composited image as a Buffer (PNG or JPEG). */
  imageBuffer: Buffer
  /** The MIME type of the returned image. */
  mimeType: string
}

/**
 * Replace the background of a portrait photo using Google Gemini.
 *
 * @param imageBuffer - The original photo as a Buffer
 * @param imageMimeType - MIME type of the input image (e.g. "image/jpeg")
 * @param bgColorHex - Target background color as hex (e.g. "#DA0B0B")
 * @returns The composited image with the new background
 */
export async function removeBackgroundWithGemini(
  imageBuffer: Buffer,
  imageMimeType: string,
  bgColorHex: string
): Promise<GeminiBgResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured")
  }

  const ai = new GoogleGenAI({ apiKey })

  const base64Image = imageBuffer.toString("base64")
  const prompt = buildBgReplacementPrompt(bgColorHex)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: imageMimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    })

    // Extract the image from the response
    const candidates = response.candidates
    if (!candidates || candidates.length === 0) {
      throw new Error("Gemini returned no candidates")
    }

    const parts = candidates[0].content?.parts
    if (!parts || parts.length === 0) {
      throw new Error("Gemini returned no parts")
    }

    // Find the image part
    for (const part of parts) {
      if (part.inlineData?.data) {
        const imageData = Buffer.from(part.inlineData.data, "base64")
        const mimeType = part.inlineData.mimeType || "image/png"
        return { imageBuffer: imageData, mimeType }
      }
    }

    // If we got text but no image, the model may have refused
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join(" ")
    throw new Error(
      `Gemini did not return an image. Response: ${textParts.slice(0, 200)}`
    )
  } finally {
    clearTimeout(timer)
  }
}
