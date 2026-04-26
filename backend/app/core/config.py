from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 días

    ANTHROPIC_API_KEY: str = ""
    APOLLO_API_KEY: str = ""
    APIFY_API_KEY: str = ""
    PDL_API_KEY: str = ""
    GOOGLE_MAPS_API_KEY: str = ""
    MERCADO_PUBLICO_API_KEY: str = ""
    HUNTER_API_KEY: str = ""

    WHATSAPP_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_VERIFY_TOKEN: str = ""
    WHATSAPP_WABA_ID: str = ""

    RESEND_API_KEY: str = ""
    SUPER_ADMIN_EMAIL: str = "catalina@kapturo.cl"
    REDIS_URL: str = "redis://localhost:6379"
    ENVIRONMENT: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()
