"""CareIQ — Router package exports."""
from api.routers import analytics, auth, patients, predictions, recommendations, data_platform, alerts

__all__ = ["analytics", "auth", "patients", "predictions", "recommendations", "data_platform", "alerts"]
