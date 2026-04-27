"""
Agente base abstracto.

Todos los agentes de IA de Kapturo heredan de esta clase.
Define la estructura común: conexión a Claude, acceso a la BD, tenant.
"""
from abc import ABC, abstractmethod
from sqlalchemy.orm import Session
import anthropic
from app.core.config import settings


class BaseAgent(ABC):
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    @abstractmethod
    async def run(self, **kwargs) -> dict:
        """
        Método principal del agente. Cada agente implementa su propia lógica.
        Siempre devuelve un dict con el resumen de lo que hizo.
        """
        pass

    def _call_claude(
        self,
        prompt: str,
        model: str = "claude-haiku-4-5-20251001",
        max_tokens: int = 500,
    ) -> str:
        """
        Llama a Claude con un prompt y devuelve el texto de respuesta.

        model: por defecto Haiku (rápido y económico)
               usa "claude-sonnet-4-5" para tareas que requieren más inteligencia
        """
        message = self.claude.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
