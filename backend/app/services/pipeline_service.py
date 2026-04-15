"""
Servicio del Pipeline CRM.

Gestiona el tablero Kanban donde se mueven los prospectos
desde "Nuevo" hasta "Cerrado Ganado".
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.pipeline import PipelineStage, PipelineCard
from app.models.prospect import Prospect


# Etapas por defecto que se crean cuando un tenant se registra
DEFAULT_STAGES = [
    {"name": "Nuevo",          "order": 0, "color": "#6366f1", "is_won": False, "is_lost": False},
    {"name": "Contactado",     "order": 1, "color": "#f59e0b", "is_won": False, "is_lost": False},
    {"name": "Respondió",      "order": 2, "color": "#3b82f6", "is_won": False, "is_lost": False},
    {"name": "Reunión",        "order": 3, "color": "#8b5cf6", "is_won": False, "is_lost": False},
    {"name": "Cerrado Ganado", "order": 4, "color": "#10b981", "is_won": True,  "is_lost": False},
    {"name": "Descartado",     "order": 5, "color": "#ef4444", "is_won": False, "is_lost": True},
]


class PipelineService:
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id

    def crear_etapas_default(self, tenant_id: str):
        """
        Crea las 6 etapas por defecto para un tenant nuevo.
        Se llama en el primer login o al inicializar la cuenta.
        """
        # Verificar que no existan ya etapas para este tenant
        existentes = (
            self.db.query(PipelineStage)
            .filter(PipelineStage.tenant_id == tenant_id)
            .count()
        )
        if existentes > 0:
            return {"mensaje": "Las etapas ya existen", "etapas_creadas": 0}

        etapas_creadas = 0
        for stage_data in DEFAULT_STAGES:
            stage = PipelineStage(
                tenant_id=tenant_id,
                name=stage_data["name"],
                order=stage_data["order"],
                color=stage_data["color"],
                is_won=stage_data["is_won"],
                is_lost=stage_data["is_lost"],
            )
            self.db.add(stage)
            etapas_creadas += 1

        self.db.commit()
        return {"mensaje": "Etapas creadas exitosamente", "etapas_creadas": etapas_creadas}

    def obtener_pipeline(self, tenant_id: str) -> list:
        """
        Devuelve todas las etapas con sus tarjetas y datos del prospecto.
        Esto construye el tablero Kanban completo.
        """
        etapas = (
            self.db.query(PipelineStage)
            .filter(PipelineStage.tenant_id == tenant_id)
            .order_by(PipelineStage.order)
            .all()
        )

        resultado = []
        for etapa in etapas:
            # Obtener tarjetas de esta etapa con datos del prospecto
            tarjetas = (
                self.db.query(PipelineCard)
                .filter(
                    PipelineCard.stage_id == etapa.id,
                    PipelineCard.tenant_id == tenant_id,
                )
                .all()
            )

            cards_data = []
            for card in tarjetas:
                prospect = self.db.query(Prospect).filter(Prospect.id == card.prospect_id).first()
                cards_data.append({
                    "id": card.id,
                    "prospect_id": card.prospect_id,
                    "stage_id": card.stage_id,
                    "notes": card.notes,
                    "next_action_at": card.next_action_at.isoformat() if card.next_action_at else None,
                    "created_at": card.created_at.isoformat() if card.created_at else None,
                    "prospect": {
                        "company_name": prospect.company_name if prospect else "",
                        "contact_name": prospect.contact_name if prospect else "",
                        "contact_title": prospect.contact_title if prospect else "",
                        "email": prospect.email if prospect else "",
                        "phone": prospect.phone if prospect else "",
                        "whatsapp": prospect.whatsapp if prospect else "",
                        "website": prospect.website if prospect else "",
                        "city": prospect.city if prospect else "",
                        "country": prospect.country if prospect else "",
                        "industry": prospect.industry if prospect else "",
                        "score": prospect.score if prospect else 0,
                        "score_reason": prospect.score_reason if prospect else "",
                        "web_status": prospect.web_status if prospect else None,
                        "source_module": prospect.source_module if prospect else None,
                        "status": prospect.status if prospect else None,
                        "source": prospect.source if prospect else None,
                        # Campos de licitación (adjudicadas)
                        "rut": prospect.rut if prospect else None,
                        "licitacion_nombre": prospect.licitacion_nombre if prospect else None,
                        "licitacion_codigo": prospect.licitacion_codigo if prospect else None,
                        "licitacion_organismo": prospect.licitacion_organismo if prospect else None,
                        "licitacion_monto_adjudicado": prospect.licitacion_monto_adjudicado if prospect else None,
                        "licitacion_fecha_adjudicacion": str(prospect.licitacion_fecha_adjudicacion) if prospect and prospect.licitacion_fecha_adjudicacion else None,
                    } if prospect else None,
                })

            resultado.append({
                "id": etapa.id,
                "name": etapa.name,
                "color": etapa.color,
                "order": etapa.order,
                "is_won": etapa.is_won,
                "is_lost": etapa.is_lost,
                "cards": cards_data,
                "total_cards": len(cards_data),
            })

        return resultado

    def mover_tarjeta(self, card_id: str, nueva_etapa_id: str, tenant_id: str) -> dict:
        """
        Mueve una tarjeta a una nueva etapa del pipeline.
        Valida que ambos pertenezcan al mismo tenant.
        """
        # Buscar la tarjeta
        card = (
            self.db.query(PipelineCard)
            .filter(
                PipelineCard.id == card_id,
                PipelineCard.tenant_id == tenant_id,
            )
            .first()
        )
        if not card:
            raise HTTPException(status_code=404, detail="Tarjeta no encontrada")

        # Verificar que la nueva etapa pertenece al mismo tenant
        nueva_etapa = (
            self.db.query(PipelineStage)
            .filter(
                PipelineStage.id == nueva_etapa_id,
                PipelineStage.tenant_id == tenant_id,
            )
            .first()
        )
        if not nueva_etapa:
            raise HTTPException(status_code=404, detail="Etapa destino no encontrada o no pertenece a este tenant")

        card.stage_id = nueva_etapa_id
        self.db.commit()

        return {
            "card_id": card_id,
            "nueva_etapa": nueva_etapa.name,
            "nueva_etapa_id": nueva_etapa_id,
        }

    def crear_etapa(self, tenant_id: str, nombre: str, color: str, order: int) -> dict:
        """Crea una nueva etapa personalizada en el pipeline."""
        etapa = PipelineStage(
            tenant_id=tenant_id,
            name=nombre,
            color=color,
            order=order,
        )
        self.db.add(etapa)
        self.db.commit()

        return {
            "id": etapa.id,
            "name": etapa.name,
            "color": etapa.color,
            "order": etapa.order,
            "is_won": etapa.is_won,
            "is_lost": etapa.is_lost,
        }

    def actualizar_etapa(self, stage_id: str, tenant_id: str, **kwargs) -> dict:
        """Actualiza los datos de una etapa existente."""
        etapa = (
            self.db.query(PipelineStage)
            .filter(
                PipelineStage.id == stage_id,
                PipelineStage.tenant_id == tenant_id,
            )
            .first()
        )
        if not etapa:
            raise HTTPException(status_code=404, detail="Etapa no encontrada")

        # Actualizar solo los campos que vienen en kwargs
        campos_permitidos = {"name", "color", "order", "is_won", "is_lost", "auto_move_score_below"}
        for campo, valor in kwargs.items():
            if campo in campos_permitidos and valor is not None:
                setattr(etapa, campo, valor)

        self.db.commit()

        return {
            "id": etapa.id,
            "name": etapa.name,
            "color": etapa.color,
            "order": etapa.order,
            "is_won": etapa.is_won,
            "is_lost": etapa.is_lost,
        }

    def eliminar_etapa(self, stage_id: str, tenant_id: str):
        """
        Elimina una etapa del pipeline.
        No permite eliminar si tiene tarjetas activas.
        """
        etapa = (
            self.db.query(PipelineStage)
            .filter(
                PipelineStage.id == stage_id,
                PipelineStage.tenant_id == tenant_id,
            )
            .first()
        )
        if not etapa:
            raise HTTPException(status_code=404, detail="Etapa no encontrada")

        # Verificar si tiene tarjetas
        tiene_tarjetas = (
            self.db.query(PipelineCard)
            .filter(PipelineCard.stage_id == stage_id)
            .count()
        )
        if tiene_tarjetas > 0:
            raise HTTPException(
                status_code=400,
                detail=f"No se puede eliminar: la etapa tiene {tiene_tarjetas} tarjeta(s) activa(s). Mueve las tarjetas primero."
            )

        self.db.delete(etapa)
        self.db.commit()

    def eliminar_tarjeta(self, card_id: str, tenant_id: str):
        card = (
            self.db.query(PipelineCard)
            .filter(PipelineCard.id == card_id, PipelineCard.tenant_id == tenant_id)
            .first()
        )
        if not card:
            raise HTTPException(status_code=404, detail="Tarjeta no encontrada")
        self.db.delete(card)
        self.db.commit()

    def actualizar_tarjeta(self, card_id: str, tenant_id: str, notes: str = None, next_action_at=None) -> dict:
        from datetime import datetime
        card = (
            self.db.query(PipelineCard)
            .filter(PipelineCard.id == card_id, PipelineCard.tenant_id == tenant_id)
            .first()
        )
        if not card:
            raise HTTPException(status_code=404, detail="Tarjeta no encontrada")
        if notes is not None:
            card.notes = notes
        if next_action_at is not None:
            card.next_action_at = datetime.fromisoformat(next_action_at) if next_action_at else None
        self.db.commit()
        return {
            "id": card.id,
            "notes": card.notes,
            "next_action_at": card.next_action_at.isoformat() if card.next_action_at else None,
        }

    def agregar_tarjeta(self, tenant_id: str, prospect_id: str, stage_id: str = None) -> dict:
        """
        Agrega un prospecto al pipeline creando una tarjeta.
        Si no se especifica etapa, usa la primera (orden más bajo).
        """
        # Verificar que el prospecto existe y pertenece al tenant
        prospect = (
            self.db.query(Prospect)
            .filter(
                Prospect.id == prospect_id,
                Prospect.tenant_id == tenant_id,
            )
            .first()
        )
        if not prospect:
            raise HTTPException(status_code=404, detail="Prospecto no encontrado")

        # Determinar la etapa
        if not stage_id:
            primera_etapa = (
                self.db.query(PipelineStage)
                .filter(PipelineStage.tenant_id == tenant_id)
                .order_by(PipelineStage.order)
                .first()
            )
            if not primera_etapa:
                raise HTTPException(
                    status_code=400,
                    detail="No hay etapas configuradas. Inicializa el pipeline primero."
                )
            stage_id = primera_etapa.id
        else:
            # Verificar que la etapa pertenece al tenant
            etapa = (
                self.db.query(PipelineStage)
                .filter(
                    PipelineStage.id == stage_id,
                    PipelineStage.tenant_id == tenant_id,
                )
                .first()
            )
            if not etapa:
                raise HTTPException(status_code=404, detail="Etapa no encontrada")

        card = PipelineCard(
            tenant_id=tenant_id,
            prospect_id=prospect_id,
            stage_id=stage_id,
        )
        self.db.add(card)
        self.db.commit()

        return {
            "id": card.id,
            "prospect_id": prospect_id,
            "stage_id": stage_id,
            "tenant_id": tenant_id,
        }
