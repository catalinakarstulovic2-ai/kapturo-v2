FROM python:3.11-slim
# build: 2026-04-15-v3

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY . .

# Puerto expuesto
EXPOSE 8000

# Arrancar — Railway inyecta PORT automáticamente
CMD ["sh", "-c", "python create_tables.py || echo 'create_tables warning, continuing' ; uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
