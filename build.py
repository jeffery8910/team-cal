"""把 team-cal.html 包成 src/page.js（Worker 送出的網頁）。改完網頁執行：python3 build.py"""
import json
body=open("team-cal.html",encoding="utf-8").read()
doc=('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
     '<meta name="theme-color" content="#17322a"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
     'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+body+'</body></html>')
open("src/page.js","w",encoding="utf-8").write("// 自動產生：網頁本體（改網頁請改 team-cal.html 再執行 python3 build.py）\nexport default "+json.dumps(doc,ensure_ascii=False)+";\n")
