"""
Normalizer del módulo Licitaciones.

Toma los datos crudos de la API de Mercado Público y los convierte
en el formato estándar de Prospect que usa toda la plataforma.

Por qué esto importa:
  Cada fuente de datos (Mercado Público, Apollo, Apify) devuelve datos
  en formatos distintos. El normalizer los convierte todos al mismo
  formato para que el resto del sistema no tenga que preocuparse por eso.
"""
import json
from datetime import datetime, timezone
from typing import Optional
from app.models.prospect import ProspectSource


class LicitacionNormalizada:
    """Datos de una licitación convertidos al formato de Kapturo."""

    def __init__(self, raw: dict, tipo_busqueda: str):
        """
        raw: un item individual de licitación (no el listado completo)
        tipo_busqueda: "licitador_a" (quiero ganar) o "licitador_b" (quiero venderle al ganador)
        """
        self.tipo_busqueda = tipo_busqueda
        self.raw = raw
        self._parse()

    def _parse(self):
        # raw es el item directo (puede ser item mínimo de lista o detalle completo)
        licitacion = self.raw

        # ── Datos básicos ──────────────────────────────────────────────────
        self.codigo = licitacion.get("CodigoExterno", "")
        self.nombre = licitacion.get("Nombre", "")
        self.descripcion = licitacion.get("Descripcion", "")

        # Estado: el detalle trae "Estado" como string; la lista solo CodigoEstado
        estado_str_map = {5: "Publicada", 6: "Cerrada", 7: "Desierta",
                          8: "Adjudicada", 15: "Revocada", 16: "Suspendida"}
        self.estado = (
            licitacion.get("Estado")
            or estado_str_map.get(licitacion.get("CodigoEstado"), "")
        )

        # Tipo: campo directo en detalle; en lista se extrae del código
        self.tipo = licitacion.get("Tipo", "")
        if not self.tipo and self.codigo:
            import re
            m = re.search(r'-([A-Z][A-Z0-9]+)\d{2}$', self.codigo)
            if m:
                self.tipo = m.group(1)

        # Monto estimado
        self.monto = self._parse_monto(licitacion.get("MontoEstimado"))
        self.visibilidad_monto = bool(licitacion.get("VisibilidadMonto", 1))

        # ── Fechas ─────────────────────────────────────────────────────────
        # En el detalle las fechas están dentro de "Fechas"; en la lista son top-level
        fechas = licitacion.get("Fechas") or {}
        self.fecha_cierre = self._fmt_fecha(
            fechas.get("FechaCierre") or licitacion.get("FechaCierre", "")
        )
        self.fecha_publicacion = self._fmt_fecha(
            fechas.get("FechaPublicacion") or licitacion.get("FechaPublicacion", "")
        )
        self.fecha_adjudicacion = self._fmt_fecha(
            fechas.get("FechaAdjudicacion") or licitacion.get("FechaAdjudicacion", "")
        )
        self.fecha_estimada_adjudicacion = self._fmt_fecha(
            fechas.get("FechaEstimadaAdjudicacion") or licitacion.get("FechaEstimadaAdjudicacion", "")
        )

        # ── Moneda ────────────────────────────────────────────────────────
        self.moneda = licitacion.get("Moneda", "") or "CLP"

        # ── Comprador / Organismo ──────────────────────────────────────────
        # En el detalle: licitacion["Comprador"] dict
        # En la lista: no existe (queda vacío)
        comprador = licitacion.get("Comprador") or {}
        self.organismo_nombre = comprador.get("NombreOrganismo", "")
        self.organismo_rut    = comprador.get("RutUnidad", "")
        self.region = comprador.get("RegionUnidad", "")
        self.categoria = ""  # se llena desde Items si hay

        # ── Contacto organismo ────────────────────────────────────────────
        # MP puede usar NombreContacto o NombreResponsableContrato según endpoint
        self.contacto_nombre = (
            comprador.get("NombreContacto")
            or comprador.get("NombreResponsableContrato")
            or licitacion.get("NombreResponsableContrato", "")
        )
        self.contacto_email = (
            comprador.get("EmailContacto")
            or comprador.get("EmailResponsableContrato")
            or licitacion.get("EmailResponsableContrato", "")
        )
        self.contacto_fono = (
            comprador.get("FonoContacto")
            or comprador.get("FonoResponsableContrato")
            or licitacion.get("FonoResponsableContrato", "")
        )

        # ── Adjudicado (Módulo B) ──────────────────────────────────────────
        # El adjudicado está en Items.Listado[n].Adjudicacion
        # NO en el campo top-level "Adjudicacion" (ese solo tiene metadatos)
        self.adjudicado_nombre       = ""
        self.adjudicado_rut          = ""
        self.adjudicado_razon_social = ""
        self.monto_adjudicado        = 0.0

        # ── Oferentes (Módulo cerrada / por_adjudicarse) ───────────────────
        # La API devuelve los oferentes en Offers.Listado
        self.ofertantes = []
        offers_top = licitacion.get("Offers") or {}
        lista_ofertas = offers_top.get("Listado", []) if isinstance(offers_top, dict) else []
        for of in lista_ofertas:
            self.ofertantes.append({
                "rut":         of.get("RutProveedor", ""),
                "nombre":      of.get("NombreProveedor", "") or of.get("RazonSocial", ""),
                "monto_oferta": float(of.get("Total") or of.get("MontoTotal") or 0) or None,
            })

        items_top = licitacion.get("Items") or {}
        lista_items = items_top.get("Listado", []) if isinstance(items_top, dict) else []

        # ── Items (líneas de la licitación) ──────────────────────────────
        self.items_lista = []
        for it in lista_items:
            nombre_item = it.get("NombreProducto") or it.get("Nombre") or ""
            if nombre_item:
                self.items_lista.append({
                    "nombre": nombre_item,
                    "cantidad": it.get("Cantidad"),
                    "unidad": it.get("UnidadMedida") or it.get("Unidad") or "",
                    "categoria": it.get("Categoria") or "",
                })

        # ── Garantías ─────────────────────────────────────────────────────
        self.garantias_lista = []
        garantias_top = licitacion.get("Garantias") or {}
        lista_garantias = garantias_top.get("Listado", []) if isinstance(garantias_top, dict) else []
        for g in lista_garantias:
            tipo = g.get("Tipo") or g.get("NombreGarantia") or ""
            monto = self._parse_monto(g.get("Monto") or g.get("MontoGarantia"))
            if tipo or monto:
                self.garantias_lista.append({
                    "tipo": tipo,
                    "monto": monto,
                    "descripcion": g.get("Descripcion") or "",
                    "fecha_vencimiento": self._fmt_fecha(g.get("FechaVencimiento") or ""),
                })

        if lista_items:
            # Categoría: del primer ítem
            primer_item = lista_items[0]
            self.categoria = primer_item.get("Categoria", "")

            # Adjudicado: agrupar todos los proveedores del primer adjudicatario
            for it in lista_items:
                adj_item = it.get("Adjudicacion") or {}
                nombre_prov = adj_item.get("NombreProveedor", "")
                rut_prov    = adj_item.get("RutProveedor", "")
                monto_unit  = float(adj_item.get("MontoUnitario") or 0)
                cant        = float(adj_item.get("Cantidad") or 1)
                self.monto_adjudicado += monto_unit * cant

                # Tomamos el primer proveedor encontrado como adjudicado principal
                if not self.adjudicado_nombre and nombre_prov:
                    self.adjudicado_nombre       = nombre_prov
                    self.adjudicado_rut          = rut_prov
                    self.adjudicado_razon_social = nombre_prov

    def _parse_monto(self, valor) -> Optional[float]:
        try:
            # Si ya es número (int/float), retornar directamente sin manipular
            if isinstance(valor, (int, float)):
                return float(valor) if valor else None
            s = str(valor or "").strip()
            if not s:
                return None
            # La API puede devolver:
            #   "460000000.0"  → float con decimal anglosajón (NO eliminar el punto)
            #   "24968688,0"   → coma decimal latina
            #   "24.968.688"   → puntos de miles (sin coma)
            # Regla: si tiene coma → formato latino (puntos=miles, coma=decimal)
            # Si tiene punto Y no parece formato de miles (ej: un solo punto al final) → decimal anglosajón
            if ',' in s:
                # Formato latino: 24.968.688,50
                s = s.replace('.', '').replace(',', '.')
            elif s.count('.') == 1:
                # Un solo punto → separador decimal anglosajón (ej: "460000000.0")
                pass  # float(s) lo maneja directamente
            else:
                # Múltiples puntos → separadores de miles (ej: "24.968.688")
                s = s.replace('.', '')
            return float(s) if s else None
        except (ValueError, AttributeError):
            return None

    def _fmt_fecha(self, valor: str) -> str:
        """Devuelve solo la parte de fecha (YYYY-MM-DD) de un ISO string."""
        if not valor:
            return ""
        return str(valor)[:10]

    def a_prospect_dict(self) -> dict:
        """Diccionario listo para crear un Prospect en la BD."""
        base = {
            "country": "Chile",
            "source": ProspectSource.mercado_publico,
            "raw_data": json.dumps(self.raw, ensure_ascii=False),
            "data_date": datetime.now(timezone.utc),
            # Campos de licitación directamente en el registro
            "licitacion_codigo": self.codigo,
            "licitacion_nombre": self.nombre,
            "licitacion_monto": self.monto,
            "licitacion_monto_adjudicado": self.monto_adjudicado or None,
            "licitacion_organismo": self.organismo_nombre,
            "licitacion_categoria": self.categoria,
            "licitacion_region": self.region,
            "licitacion_estado": self.estado,
            "licitacion_fecha_adjudicacion": self.fecha_adjudicacion,
            "licitacion_fecha_cierre": self.fecha_cierre,
        }
        if self.tipo_busqueda == "licitador_b":
            base.update({
                "company_name": self.adjudicado_razon_social or self.adjudicado_nombre,
                "rut": self.adjudicado_rut,
                "city": self.region,
                "source_module": "licitador_b",
            })
        else:
            base.update({
                "company_name": self.organismo_nombre,
                "rut": self.organismo_rut,
                "city": self.region,
                "source_module": "licitador_a",
            })
        return base

    def a_preview_dict(self) -> dict:
        """Diccionario para mostrar en la tabla (sin guardar en BD)."""
        base = {
            "codigo": self.codigo,
            "nombre": self.nombre,
            "descripcion": self.descripcion[:300] if self.descripcion else "",
            "monto": self.monto,
            "organismo": self.organismo_nombre,
            "organismo_rut": self.organismo_rut,
            "categoria": self.categoria,
            "region": self.region,
            "estado": self.estado,
            "tipo": self.tipo,
            "fecha_cierre": self.fecha_cierre,
            "fecha_adjudicacion": self.fecha_adjudicacion,
            "fecha_estimada_adjudicacion": self.fecha_estimada_adjudicacion,
            "fecha_publicacion": self.fecha_publicacion,
            "ofertantes": self.ofertantes,
            "ofertantes_count": len(self.ofertantes),
            # Contacto vacío por defecto (se llena si ya fue guardado)
            "prospect_id": None,
            "email": None,
            "phone": None,
            "website": None,
            "address": None,
            "enrichment_source": None,
            "score": None,
            "score_reason": None,
            # Campos enriquecidos
            "moneda": self.moneda,
            "contacto_nombre": self.contacto_nombre or None,
            "contacto_email": self.contacto_email or None,
            "contacto_fono": self.contacto_fono or None,
            "items_lista": self.items_lista[:10],  # máximo 10 para no saturar
            "garantias_lista": self.garantias_lista,
        }
        if self.tipo_busqueda == "licitador_b":
            base["monto_adjudicado"] = self.monto_adjudicado or None
            base["adjudicado_nombre"] = self.adjudicado_razon_social or self.adjudicado_nombre
            base["adjudicado_rut"] = self.adjudicado_rut
        return base


def normalizar_respuesta_api(respuesta: dict, tipo_busqueda: str) -> list[dict]:
    """
    Convierte la respuesta completa de la API en una lista de dicts
    listos para guardar como prospectos (sin _context — campos directos).
    """
    licitaciones = respuesta.get("Listado", [])
    prospectos = []

    for item in licitaciones:
        try:
            normalizada = LicitacionNormalizada(item, tipo_busqueda)
            if tipo_busqueda == "licitador_b" and not normalizada.adjudicado_rut:
                continue
            prospectos.append(normalizada.a_prospect_dict())
        except Exception:
            continue

    return prospectos


def normalizar_para_preview(respuesta: dict, tipo_busqueda: str) -> list[dict]:
    """
    Convierte la respuesta de la API en una lista de dicts para mostrar
    en la tabla del frontend (no guarda en BD).
    """
    licitaciones = respuesta.get("Listado", [])
    previews = []

    for item in licitaciones:
        try:
            normalizada = LicitacionNormalizada(item, tipo_busqueda)
            if tipo_busqueda == "licitador_b" and not normalizada.adjudicado_rut:
                continue
            previews.append(normalizada.a_preview_dict())
        except Exception:
            continue

    return previews
