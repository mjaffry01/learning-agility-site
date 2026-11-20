"""Build a SCORM 1.2 package from dist/.

Usage (from the project folder):  python scorm/build_scorm.py
Output: scorm-package/learning-agility-scorm12.zip  (dist/ itself is not modified)
"""
import pathlib
import zipfile
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
HERE = ROOT / "scorm"
OUT_DIR = ROOT / "scorm-package"
OUT = OUT_DIR / "learning-agility-scorm12.zip"

COURSE_ID = "learning-agility-49003"
TITLE = "Cultivating Learning Agility"

STORED = {".mp4", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".zip"}

OLD_NOTE = "Saved resources and review marks stay in this browser. They are not LMS completion records."
NEW_NOTE = ("Saved resources and review marks are stored in your LMS. "
            "Mark every Part video as reviewed to complete this course.")


def patched(name: str, data: bytes) -> bytes:
    if name == "index.html":
        html = data.decode("utf-8")
        tag = '<script src="data.js"></script>'
        assert tag in html, "index.html layout changed; update build_scorm.py"
        return html.replace(tag, tag + '<script src="scorm.js"></script>').encode("utf-8")
    if name == "app.js":
        js = data.decode("utf-8")
        return js.replace(OLD_NOTE, NEW_NOTE).encode("utf-8")
    return data


def manifest(files):
    file_tags = "\n".join(f'      <file href="{escape(f)}"/>' for f in files)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{COURSE_ID}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org-1">
    <organization identifier="org-1">
      <title>{escape(TITLE)}</title>
      <item identifier="item-1" identifierref="res-1" isvisible="true">
        <title>{escape(TITLE)}</title>
        <adlcp:masteryscore>100</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
{file_tags}
    </resource>
  </resources>
</manifest>
"""


def main():
    sources = sorted(p for p in DIST.rglob("*") if p.is_file())
    entries = [(p.relative_to(DIST).as_posix(), p) for p in sources]
    entries.append(("scorm.js", HERE / "scorm.js"))
    names = [n for n, _ in entries]

    OUT_DIR.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, "w") as z:
        z.writestr("imsmanifest.xml", manifest(names), compress_type=zipfile.ZIP_DEFLATED)
        for name, path in entries:
            data = patched(name, path.read_bytes())
            kind = zipfile.ZIP_STORED if path.suffix.lower() in STORED else zipfile.ZIP_DEFLATED
            z.writestr(name, data, compress_type=kind)
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1048576:.1f} MB, {len(names) + 1} files)")


if __name__ == "__main__":
    main()
