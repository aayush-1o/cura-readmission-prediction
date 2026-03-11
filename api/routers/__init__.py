"""CareIQ — Router package exports."""
from api.routers import analytics, auth, patients, predictions, recommendations

__all__ = ["analytics", "auth", "patients", "predictions", "recommendations"]
