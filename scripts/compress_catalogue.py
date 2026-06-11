"""Compress the WiseMelon catalogue by re-rendering each page as a JPEG-backed PDF.
This reduces file size dramatically while preserving visual fidelity."""
import fitz
import io
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "wisemelon-catalogue.pdf")

src_doc = fitz.open(SRC)
out_doc = fitz.open()

for i, page in enumerate(src_doc):
    # 150 DPI → enough for crisp viewing on screens, much smaller than print 300dpi
    pix = page.get_pixmap(matrix=fitz.Matrix(150/72, 150/72))
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=78, optimize=True, progressive=True)
    buf.seek(0)
    # Insert as an image-only page at the same dimensions (in points)
    new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
    new_page.insert_image(page.rect, stream=buf.getvalue())
    print(f"Page {i+1} compressed")

out_doc.save(OUT, garbage=4, deflate=True, clean=True)
out_doc.close()
src_doc.close()
size_mb = os.path.getsize(OUT) / (1024 * 1024)
print(f"DONE: {OUT} -> {size_mb:.2f} MB")
