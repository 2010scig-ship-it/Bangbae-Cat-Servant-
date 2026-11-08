"""src/의 HTML·JS와 sounds/의 소리 파일을 HTML 파일 하나로 합친다."""
import base64, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
SRC, SOUNDS = ROOT / "src", ROOT / "sounds"
MIME = {".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4"}

html = (SRC / "index.html").read_text(encoding="utf-8")
html = re.sub(r'<script src="([\w.]+)"></script>\n?',
              lambda m: "", html)
js = "\n".join((SRC / f).read_text(encoding="utf-8") for f in ["data.js", "audio.js", "draw.js", "game.js", "ui.js"])

data = {}
if SOUNDS.exists():
    for f in sorted(SOUNDS.iterdir()):
        if f.suffix.lower() in MIME:
            data[f.stem] = f"data:{MIME[f.suffix.lower()]};base64," + base64.b64encode(f.read_bytes()).decode()
sound_tag = f"<script>window.SOUND_DATA={json.dumps(data)};</script>\n" if data else ""
html = html.replace("<!--SOUND_DATA-->", sound_tag + "<script>\n" + js.replace("</script", "<\\/script") + "\n</script>")

out = ROOT / "cat-game.html"
out.write_text(html, encoding="utf-8")
print(f"{out.name}: {out.stat().st_size/1024/1024:.2f} MB, sounds: {', '.join(data) or '(none, synth fallback)'}")

# 아티팩트 게시용: 게시 시 문서 뼈대가 자동으로 씌워지므로 doctype/html/head/body와 viewport 태그를 뺀다
art = re.sub(r'<!doctype html>\n|</?html[^>]*>\n?|</?head>\n?|</?body>\n?|<meta name="viewport"[^>]*>\n', '', html)
(ROOT / "artifact.html").write_text(art, encoding="utf-8")
print(f"artifact.html: {len(art.encode())/1024/1024:.2f} MB")

# GitHub Pages 업로드용: deploy/index.html
(ROOT / "deploy").mkdir(exist_ok=True)
(ROOT / "deploy" / "index.html").write_text(html, encoding="utf-8")
print("deploy/index.html: updated")

# GitHub 저장소 루트용: GitHub Pages가 바로 index.html을 보여준다
(ROOT / "index.html").write_text(html, encoding="utf-8")
print("index.html: updated")
