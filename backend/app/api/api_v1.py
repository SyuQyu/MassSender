from fastapi import APIRouter

from app.api.routes import ai, automation, auth, campaigns, contacts, dev, health, media, users, wa, wallet

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(wa.router, prefix="/wa", tags=["wa"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
api_router.include_router(campaigns.router, prefix="/campaigns", tags=["campaigns"])
api_router.include_router(automation.router, prefix="/automation", tags=["automation"])
api_router.include_router(wallet.router, prefix="/wallet", tags=["wallet"])
api_router.include_router(media.router, prefix="/media", tags=["media"])
api_router.include_router(dev.router, prefix="/dev", tags=["dev"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
