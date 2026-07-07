from typing import Dict, Any

def check_vendor_concentration_risk(vendor_domain: str) -> Dict[str, Any]:
    """
    Mocked API for querying Threat Intelligence / Central Register about a vendor.
    In a real scenario, this would query something like an ENISA central register
    or a commercial TPRM database (e.g., SecurityScorecard, RiskRecon).
    """
    # Mock database of known sub-contractors and their concentration risk
    mock_db = {
        "auth0.com": {
            "vendor_name": "Auth0 (Okta)",
            "eu_market_penetration": "85%",
            "concentration_risk": "HIGH",
            "dora_status": "CRITICAL_ICT_PROVIDER",
            "recent_incidents": 0
        },
        "aws.amazon.com": {
            "vendor_name": "Amazon Web Services",
            "eu_market_penetration": "60%",
            "concentration_risk": "HIGH",
            "dora_status": "CRITICAL_ICT_PROVIDER",
            "recent_incidents": 1
        },
        "obscure-data-center.local": {
            "vendor_name": "Obscure DC GmbH",
            "eu_market_penetration": "1%",
            "concentration_risk": "LOW",
            "dora_status": "NON_CRITICAL",
            "recent_incidents": 0
        }
    }
    
    # Return mock data or default if not found
    return mock_db.get(vendor_domain.lower(), {
        "vendor_name": vendor_domain,
        "eu_market_penetration": "UNKNOWN",
        "concentration_risk": "UNKNOWN",
        "dora_status": "UNKNOWN",
        "recent_incidents": 0
    })
