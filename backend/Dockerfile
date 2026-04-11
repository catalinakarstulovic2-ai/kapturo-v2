FROM python:3.11-slim

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
CMD ["sh", "-c", "python create_tables.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
