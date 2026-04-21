from app.core.database import SessionLocal
from app.models.prospect import Prospect

db = SessionLocal()

# Borrar test leads
deleted = db.query(Prospect).filter(Prospect.contact_name.like('%Test Lead%')).delete()
db.commit()
print(f"🗑️  Eliminados {deleted} test leads")

# Ver qué queda
prospectos = db.query(Prospect).order_by(Prospect.created_at.desc()).limit(20).all()
print(f"\n📋 Prospectos reales en BD: {len(prospectos)}")
for p in prospectos:
    print(f"\n  👤 {p.contact_name or p.company_name or '(sin nombre)'}")
    print(f"     Score:    {p.score}")
    print(f"     Email:    {p.email or '—'}")
    print(f"     Teléfono: {p.phone or '—'}")
    print(f"     LinkedIn: {p.linkedin_url or '—'}")
    print(f"     Señal:    {(p.signal_text or '')[:80]}")
    print(f"     Fuente:   {p.source}")

db.close()
