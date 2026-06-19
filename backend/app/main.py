import logging
from fastapi import FastAPI
from app.routers import webhooks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

app = FastAPI(title="Staytraq Chatbot Backend")

# Include webhooks router
app.include_router(webhooks.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Staytraq Chatbot Backend"}
