# Pendientes Kapturo
_Última actualización: 20 abril 2026_

---

## 🗺️ Estado real del sistema

### ✅ MÓDULO 1: Licitaciones (~85% — casi listo para vender)
- ✅ Búsqueda y filtros por región/rubro/estado
- ✅ Detalle completo de cada licitación
- ✅ Generación de propuestas con IA
- ✅ Guardado de licitaciones favoritas
- ✅ Calificación automática por rubro del tenant
- ❌ Notificación por email cuando aparece licitación relevante nueva
- ❌ Historial de propuestas generadas

### ✅ MÓDULO 2: Adjudicadas + Pipeline (~80% — funcional, falta pulir)
- ✅ Scraping automático de empresas adjudicadas (Mercado Público)
- ✅ Kanban de seguimiento (drag & drop entre etapas)
- ✅ Búsqueda de contacto por empresa
- ✅ Acceso directo a WhatsApp y email desde tarjeta
- ❌ Envío de email/WhatsApp desde dentro del Kanban (hoy solo abre cliente externo)
- ❌ Notas por tarjeta en el Kanban

### 🔶 MÓDULO 3: Inmobiliaria (~65% — funciona pero incompleto)
- ✅ Scraping Google Maps de empresas del nicho
- ✅ Enriquecimiento con Hunter.io
- ✅ Calificación con Claude
- ✅ Lista de leads con score
- ❌ Leads calificados → Pipeline automáticamente
- ❌ Seguimiento del lead desde la tabla (notas, estado, alarma)
- ❌ Enviar WhatsApp desde la tabla

### 🔶 MÓDULO 4: LinkedIn Prospecting (~60% — funciona, le falta madurez)
- ✅ Scraping de perfiles LinkedIn (Apify + dev_fusion)
- ✅ Tabla con leads ordenados por score IA
- ✅ Botón "Email IA" → genera y envía email con Claude
- ✅ Botón "Buscar email" → Hunter.io
- ❌ Pasar leads al Pipeline
- ❌ Secuencias de follow-up (email 2, email 3)
- ❌ Filtros por cargo / país / empresa
- ❌ Marcar leads como "contactado" / "no interesado"

### 🔶 MÓDULO 5: Conversaciones / Inbox WhatsApp (~50% — UI lista, canal sin conectar)
- ✅ UI de bandeja de mensajes tipo WhatsApp
- ✅ Generación de respuesta con IA
- ❌ Webhook de WhatsApp real (hoy no llegan mensajes reales)
- ❌ Envío real de WhatsApp (requiere número Business verificado — usar WATI o 360dialog)

### 🔴 MÓDULO 6: Agentes IA (~40% — lógica existe, UI básica)
- ✅ WriterAgent (genera emails)
- ✅ QualifierAgent (califica leads)
- ✅ CleanerAgent
- ✅ FollowUpAgent (existe en backend, no expuesto en UI)
- ❌ UI para configurar secuencias de follow-up
- ❌ Ejecución automática programada por tenant

### 🔴 MÓDULO 7: Campañas (~0% — carpeta vacía)
- ❌ No implementado

---

## 🎯 Prioridades para cerrar módulos vendibles

| # | Qué hacer | Módulos que cierra |
|---|---|---|
| 1 | Leads LinkedIn/Inmobiliaria → Pipeline automático | 3 y 4 |
| 2 | Dominio Resend + follow-up automático (email 2, 3) | 4 y 6 |
| 3 | Notas + estado en tabla LinkedIn e Inmobiliaria | 3 y 4 |
| 4 | WhatsApp real (WATI/360dialog) | 5 |
| 5 | Notificación email licitaciones nuevas | 1 |

---

## 🔧 Técnico pendiente

- **Dominio Resend**: Agregar registro DNS en `kapturo.cl` para enviar desde `notificaciones@kapturo.cl`
  - Hoy usa temporal `onboarding@resend.dev`
  - Luego restaurar `FROM_ADDRESS` en `backend/app/services/email_service.py`
- **Email Eduardo**: Restaurar `eduardo@betterfly.com` en BD local (hoy tiene email de prueba)
- **HUNTER_API_KEY**: Ya en Railway ✅ | Ya en `.env` local ✅

---

## ✅ Completado (20 abril 2026)
- Filtro leads LinkedIn sin nombre (elimina "Perfil LinkedIn" vacíos)
- Botón "Buscar email" → Hunter.io para leads sin email
- Botón "Email IA" → genera y envía email con Claude
- Endpoint `/enriquecer` con Hunter.io en backend
- Fix cron LinkedIn: responde inmediato + background con timeout 8 min + cap 5 queries / 30 perfiles
- `HUNTER_API_KEY` subida a Railway vía CLI
- Ordenamiento leads: score IA primero, desempate por disponibilidad de contacto
