"""把 team-cal.html、guide.html 包成 src/page.js、src/guide.js（Worker 送出的網頁）。
改完網頁執行：python3 build.py"""
import json

HEAD = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#17322a"><style>:root{padding-top:env(safe-area-inset-top,0px);'
        'padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}'
        '[hidden]{display:none!important}</style></head><body>')

for src, out in [("team-cal.html", "src/page.js"), ("guide.html", "src/guide.js")]:
    body = open(src, encoding="utf-8").read()
    doc = HEAD + body + "</body></html>"
    with open(out, "w", encoding="utf-8") as f:
        f.write(f"// 自動產生：{src}（改網頁請改 {src} 再執行 python3 build.py）\n")
        f.write("export default " + json.dumps(doc, ensure_ascii=False) + ";\n")
    print(out, len(doc))
