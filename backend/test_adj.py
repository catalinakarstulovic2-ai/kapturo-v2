import asyncio, sys, json
sys.path.insert(0,'.')
from app.modules.licitaciones.client import MercadoPublicoClient

async def test():
    c = MercadoPublicoClient()
    resp = await c.buscar_licitaciones(fecha='09042026', estado='adjudicada')
    listado = resp.get('Listado', [])
    cod = listado[0].get('CodigoExterno') if listado else None
    print('Codigo:', cod)
    detalle = await c.obtener_detalle(cod)
    print('Top keys:', list(detalle.keys()))
    items = detalle.get('Items', {}).get('Listado', [])
    if items:
        adj = items[0].get('Adjudicacion', {})
        print('Adjudicacion keys:', list(adj.keys()))
        print('Adjudicacion data:', json.dumps(adj, ensure_ascii=False))
    prov = detalle.get('Proveedor', {})
    print('Proveedor top-level:', json.dumps(prov, ensure_ascii=False) if prov else 'none')

asyncio.run(test())
