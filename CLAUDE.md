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
