"""Test: estructura del detalle + normalizador"""
import asyncio, json, sys
sys.path.insert(0, ".")

from app.modules.licitaciones.client import MercadoPublicoClient
from app.modules.licitaciones.normalizer import LicitacionNormalizada

async def main():
    c = MercadoPublicoClient()

    # 1. Obtener un código adjudicado reciente
    r = await c.buscar_adjudicadas(fecha="13042026")
    listado = r.get("Listado", [])
    if not listado:
        print("Sin items para esa fecha")
        return

    codigo = listado[0]["CodigoExterno"]
    print(f"Código: {codigo}")

    # 2. Detalle completo
    d = await c.obtener_detalle(codigo)
    print(f"Keys top-level: {list(d.keys())}")
    print("Detalle parcial:")
    print(json.dumps(d, indent=2, ensure_ascii=False)[:2000])

    # 3. Probar normalizador
    try:
        n = LicitacionNormalizada(d, tipo_busqueda="licitador_b")
        print("\n--- Normalizado ---")
        print(f"codigo: {n.codigo}")
        print(f"nombre: {n.nombre}")
        print(f"organismo: {n.organismo}")
        print(f"region: {n.region}")
        print(f"monto_adjudicado: {n.monto_adjudicado}")
        print(f"adjudicado_rut: {n.adjudicado_rut}")
        print(f"adjudicado_nombre: {n.adjudicado_nombre}")
        print(f"fecha_adjudicacion: {n.fecha_adjudicacion}")
    except Exception as e:
        print(f"ERROR en normalizador: {e}")

asyncio.run(main())
