import fitz
import os
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "catalogue_pages")
os.makedirs(out_dir, exist_ok=True)
doc = fitz.open(r"d:\Catlogue\PDF\Ready to Print.pdf")
for i, page in enumerate(doc):
    # render at 110 DPI
    pix = page.get_pixmap(matrix=fitz.Matrix(110/72, 110/72))
    out = os.path.join(out_dir, f"page_{i+1:02d}.png")
    pix.save(out)
    print("saved", out, pix.width, "x", pix.height)
doc.close()
print("DONE")
