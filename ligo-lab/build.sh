#!/bin/bash
# Une los módulos en un solo HTML. Uso: ./build.sh [--local]  (--local usa three.js local para pruebas)
cd "$(dirname "$0")"
python3 -I - "$@" <<'PY'
import sys,re
t=open('template.html').read()
css=open('src/style.css').read()
js="\n".join(open('src/'+f).read() for f in ['physics.js','core.js','universe3d.js','detector3d.js','charts.js','ui.js'])
t=t.replace('/*__STYLE__*/',css).replace('/*__SCRIPTS__*/',js)
if '--local' in sys.argv:
    t=t.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','three.min.js')
open('dist.html' if '--local' in sys.argv else 'index.html','w').write(t)
PY
