# CLAUDE.md

Instrucciones permanentes para Claude Code en este repo.

## Reportes: siempre a archivo, nunca solo al chat

La terminal corta las salidas largas y Leonardo no puede copiarlas.
Por eso, TODO reporte, análisis, inventario o auditoría se escribe
en un archivo del repo, además del resumen corto en el chat.

Reglas:
1. El archivo va en docs/reportes/YYYY-MM-DD-<tema>.md
2. Se commitea y se PUSHEA. Un reporte sin push no existe.
3. En el chat va solo: ruta del archivo + branch + SHA del remoto
   (git log origin/<branch> -1 --format='%H') + 3-5 bullets de
   conclusión. Nada más.
4. Si el push falla, decilo. Nunca reportar completado sin el SHA
   del remoto verificado.
5. Si la tarea es solo análisis (no toca código), el reporte igual
   va a un branch propio, nunca a main.

Esto aplica siempre, sin que haga falta pedirlo.

## SHA al terminar: siempre, como última línea

Toda respuesta que cierre una tarea (commit, push, merge, reporte)
termina con el SHA del remoto, sin que Leonardo tenga que pedirlo:

    SHA <branch>: <hash>

- El hash sale de `git fetch && git log origin/<branch> -1 --format='%H'`
  DESPUÉS del push. Nunca el SHA local.
- Si se mergeó a main, también va `SHA main: <hash>` de origin/main.
- Si el trabajo quedó en un branch sin mergear, aclararlo en esa línea
  o justo antes (ej. "no mergeado").
- Si el push falló, no hay SHA: decirlo en su lugar.
