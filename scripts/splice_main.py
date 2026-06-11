"""Replace the <main>...</main> block in src/app/page.tsx with new WiseMelon content."""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "src", "app", "page.tsx")
NEW_MAIN_PATH = os.path.join(ROOT, "scripts", "new_main.md")

with open(PAGE, "r", encoding="utf-8") as f:
    src = f.read()

START = "        {/* \u2550\u2550\u2550 MAIN CONTENT \u2550\u2550\u2550 */}\n"
END = "        </main>\n"

i = src.find(START)
if i < 0:
    raise SystemExit("Start marker not found")
j = src.find(END, i)
if j < 0:
    raise SystemExit("End marker not found")
j += len(END)

with open(NEW_MAIN_PATH, "r", encoding="utf-8") as f:
    new_main = f.read()

new_src = src[:i] + new_main + src[j:]
with open(PAGE, "w", encoding="utf-8", newline="\n") as f:
    f.write(new_src)
print(f"Replaced {j-i} chars with {len(new_main)} chars")
