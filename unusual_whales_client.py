"""Client utilities for interacting with the Unusual Whales REST API."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests

DEFAULT_BASE_URL = "https://api.unusualwhales.com"
DEFAULT_PREDICT_PATH = "/api/meteorology/predict"
DEFAULT_ENHANCED_PATH = "/api/meteorology/predict/enhanced"
DEFAULT_FLOW_PATH = "/api/options/flow"


@dataclass
class UnusualWhalesConfig:
    """Runtime configuration for the Unusual Whales client."""

    base_url: str = DEFAULT_BASE_URL
    token: Optional[str] = None
    predict_path: str = DEFAULT_PREDICT_PATH
    enhanced_path: str = DEFAULT_ENHANCED_PATH
    flow_path: str = DEFAULT_FLOW_PATH
    timeout: int = 30

    @classmethod
    def from_env(cls) -> "UnusualWhalesConfig":
        """Build configuration from environment variables."""
        return cls(
            base_url=os.getenv("UNUSUAL_WHALES_API_BASE", DEFAULT_BASE_URL),
            token=os.getenv("UNUSUAL_WHALES_API_TOKEN"),
            predict_path=os.getenv("UNUSUAL_WHALES_PREDICT_PATH", DEFAULT_PREDICT_PATH),
            enhanced_path=os.getenv("UNUSUAL_WHALES_ENHANCED_PATH", DEFAULT_ENHANCED_PATH),
            flow_path=os.getenv("UNUSUAL_WHALES_FLOW_PATH", DEFAULT_FLOW_PATH),
            timeout=int(os.getenv("UNUSUAL_WHALES_TIMEOUT", "30")),
        )


class UnusualWhalesClient:
    """Tiny helper around the Unusual Whales HTTP API."""

    def __init__(self, config: Optional[UnusualWhalesConfig] = None):
        self.config = config or UnusualWhalesConfig.from_env()
        self._session = requests.Session()
        headers = {
            "Accept": "application/json",
            "User-Agent": "hurricane-backtester/1.0",
        }
        if self.config.token:
            headers["Authorization"] = f"Bearer {self.config.token}"
        self._session.headers.update(headers)

    @property
    def is_configured(self) -> bool:
        """Return True when the client has credentials configured."""
        return bool(self.config.token)

    def _build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        base = self.config.base_url.rstrip("/")
        endpoint = path.lstrip("/")
        return f"{base}/{endpoint}"

    def _request(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self.is_configured:
            raise RuntimeError(
                "Unusual Whales API token is not configured. Set UNUSUAL_WHALES_API_TOKEN first."
            )

        url = self._build_url(path)
        response = self._session.get(url, params=params, timeout=self.config.timeout)
        response.raise_for_status()
        return response.json()

    def fetch_prediction(self, symbol: str, asof: Optional[str] = None) -> Dict[str, Any]:
        """Fetch the core Hurricane prediction payload for ``symbol``."""
        params = {"symbol": symbol.upper()}
        if asof:
            params["asof"] = asof
        return self._request(self.config.predict_path, params=params)

    def fetch_enhanced_prediction(self, symbol: str, asof: Optional[str] = None) -> Dict[str, Any]:
        """Fetch the enhanced Hurricane prediction payload for ``symbol``."""
        params = {"symbol": symbol.upper()}
        if asof:
            params["asof"] = asof
        return self._request(self.config.enhanced_path, params=params)

    def fetch_flow_snapshot(self, symbol: str) -> Dict[str, Any]:
        """Fetch the latest options flow metrics for ``symbol``."""
        params = {"symbol": symbol.upper()}
        return self._request(self.config.flow_path, params=params)


__all__ = ["UnusualWhalesClient", "UnusualWhalesConfig"]
