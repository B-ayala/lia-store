# CLAUDE.md — Backend (lia-store / "lia-ecommerce")

> Archivo de configuración de Claude Code para **este repositorio (backend)**.
> Carga automáticamente el sistema de skills senior compartido y deja disponible
> la documentación técnica del proyecto.

---

## 🎯 Contexto del proyecto

Este repo es el **backend** de la tienda **damiana-bella**: una **API REST en Node.js + Express**
con patrón **MVC**, sobre **PostgreSQL/Supabase** (acceso directo con `pg`). Expone:

- `/api/users` — perfiles (`public.profiles` + `auth.users`), login de referencia, rate-limit de signup.
- `/api/products` — CRUD de productos (lectura pública, escritura admin con JWT de Supabase).
- `/api/cloudinary` — firma de uploads y gestión de imágenes/carpetas.

Entry point: `server.js`. Scripts: `npm run dev` (nodemon), `npm start`, `npm run init-db`.

📄 Documentación técnica completa (estructura, arquitectura MVC, endpoints, modelo de datos,
configuración, riesgos de seguridad y **discrepancias con el frontend**) en
[DOCUMENTACION_BACKEND.md](DOCUMENTACION_BACKEND.md). **Leela antes de tocar código.**

⚠️ **Importante:** el frontend actual (`../../FRONT/damiana-bella`) usa un contrato de auth
(JWT propio) y endpoints (`/auth/*`, `/orders/*`, `/shipping`) que **este backend no implementa**.
Ver sección 11 de la documentación antes de integrar o modificar contratos.

---

## 🧠 Skills senior compartidos (carga automática)

Los siguientes skills viven en `../../skill/` (carpeta compartida entre frontend y backend)
y se importan automáticamente. Aplican como contrato de calidad para todo lo que se genere
en este repo.

@../../skill/00-role.md
@../../skill/01-backend.md
@../../skill/03-testing-qa.md
@../../skill/04-security.md
@../../skill/06-restrictions.md
@../../skill/07-senior-rules.md
@../../skill/08-delivery-format.md
@../../skill/09-protocols.md
@../../skill/10-documentation.md
@../../skill/11-bug-hunter.md
@../../skill/12-judge-architect.md

> Selección backend según `../../skill/README.md` (00 + 01 + 03 + 04 + 06 + 07 + 08 + 09 + 10),
> más bug-hunter (11) y judge-architect (12). Se omiten `02-frontend.md` y `05-ux.md`
> (viven en el repo frontend).
>
> **Nota de portabilidad:** las rutas `@../../skill/*` resuelven a `…/orden damiana/skill`.
> Si clonás este repo fuera de esa estructura de carpetas, ajustá las rutas o copiá la carpeta
> `skill/` al nuevo emplazamiento.

---

## ⚠️ Reglas específicas de este repo

- **Secretos solo en `.env`** (DB, Cloudinary). Hoy `.env.example` contiene credenciales reales:
  **rotarlas** y dejar placeholders (ver §10 de la documentación).
- **Seguridad de auth pendiente**: `authMiddleware` decodifica el JWT sin verificar firma, y las
  rutas de usuarios están sin proteger. No tratar la auth actual como confiable.
- No mezclar lógica de frontend en este repo. Mantener la documentación separada de la del front.
