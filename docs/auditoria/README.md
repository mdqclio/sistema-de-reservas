# Auditoría de producción — sistema-de-reservas

Auditoría previa a salir a vender la app. Fecha: **2026-06-05**. Auditor: revisión asistida.

## Archivos

- **[`sistema-de-reservas.md`](./sistema-de-reservas.md)** — informe completo, 10 puntos, con estado 🟢/🟡/🔴, hallazgo y riesgo.
- **[`REMEDIACION.md`](./REMEDIACION.md)** — checklist de arreglos con estado (hecho / pendiente) y quién debe hacerlos.
- **Reglas de seguridad** → carpeta [`/security`](../../security) en la raíz del repo (archivos listos para pegar en Firebase Console).

## TL;DR — los 3 más urgentes

1. **Reglas de seguridad Firebase por rol (RTDB + Storage).** Hoy `loadAllData()` baja toda la base (plata, PII, documentos) a cada navegador y las reglas están en modo test. → `/security/database.rules.json` cierra el acceso anónimo YA.
2. **Sacar la API key de Groq del cliente/DB + auth en webhooks.** La key vivía en RTDB compartida. → arreglado en código (ver REMEDIACION).
3. **Autorización real, no CSS.** `.admin-only` solo esconde; los datos ya están en el cliente. → requiere reglas (punto 1) + capa de rol.

## Alcance

Repo `mdqclio/sistema-de-reservas` (`index.html` single-file, 6.765 líneas) + backend Firebase RTDB + Groq + n8n/Beds24. El panel `mibot247` tiene su propia auditoría en su repo.
</content>
