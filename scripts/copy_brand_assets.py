"""Copy WiseMelon brand assets and render selected catalogue pages into public/."""
import fitz
import shutil
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
CAT_DIR = os.path.join(PUBLIC, "catalogue")
os.makedirs(CAT_DIR, exist_ok=True)

# 1) Copy logos
shutil.copyfile(r"d:\Logo & Intro Video\PNG FINAL-02.png", os.path.join(PUBLIC, "wisemelon-logo.png"))
shutil.copyfile(r"d:\Logo & Intro Video\ONLY ICON PNG-02.png", os.path.join(PUBLIC, "wisemelon-icon.png"))
print("Logos copied")

# 2) Copy catalogue PDF for download
shutil.copyfile(r"d:\Catlogue\PDF\Ready to Print.pdf", os.path.join(PUBLIC, "wisemelon-catalogue.pdf"))
print("Catalogue PDF copied")

# 3) Render selected catalogue pages as JPG (web-optimized) for the gallery
# Selected pages: 1 (cover), 4 (attire), 6 (shoes), 8 (ID cards), 10 (lanyards), 15 (office), 18 (mugs)
selected = [1, 4, 6, 8, 10, 15, 18]
doc = fitz.open(r"d:\Catlogue\PDF\Ready to Print.pdf")
for idx in selected:
    page = doc[idx - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(150/72, 150/72))  # 150 DPI
    out = os.path.join(CAT_DIR, f"page-{idx:02d}.jpg")
    pix.pil_save(out, format="JPEG", quality=85, optimize=True)
    print(f"Rendered page {idx} -> {out} ({pix.width}x{pix.height})")
doc.close()
print("DONE")
