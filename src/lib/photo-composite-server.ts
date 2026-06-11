import sharp from "sharp"
import { parseHexColor } from "@/lib/photo-background"

export async function compositePhotoBackground(
  transparentPng: Buffer,
  bgColorHex: string
): Promise<Buffer> {
  const target = parseHexColor(bgColorHex) || { r: 255, g: 255, b: 255 }
  const meta = await sharp(transparentPng).metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height) {
    throw new Error("Invalid transparent image dimensions")
  }

  const bg = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: target.r, g: target.g, b: target.b },
    },
  })
    .png()
    .toBuffer()

  return sharp(bg)
    .composite([{ input: transparentPng, blend: "over" }])
    .jpeg({ quality: 92 })
    .toBuffer()
}
