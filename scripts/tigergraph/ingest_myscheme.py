import json
import os
import urllib.request
import urllib.parse
import urllib.error
import requests
from pathlib import Path
from dotenv import load_dotenv
import pyTigerGraph as tg

# Load environment variables (prefer file values over shell leftovers)
load_dotenv(Path(__file__).parent.parent.parent / "agent" / ".env.local", override=True)

# TigerGraph Credentials
TG_HOST = os.environ.get("TIGERGRAPH_HOST")
TG_USERNAME = os.environ.get("TIGERGRAPH_USERNAME")
TG_PASSWORD = os.environ.get("TIGERGRAPH_PASSWORD")
TG_SECRET = os.environ.get("TIGERGRAPH_SECRET")
TG_TOKEN = os.environ.get("TIGERGRAPH_TOKEN")
TG_GRAPH = os.environ.get("TIGERGRAPH_GRAPH_NAME", "AdhikaarGraph")

# myScheme API
MYSCHEME_API_BASE = "https://api.myscheme.gov.in/search/v6/schemes"
MYSCHEME_API_KEY = os.environ.get("MYSCHEME_API_KEY", "")


def _generate_token_from_secret():
    token_resp = requests.post(
        f"{TG_HOST.rstrip('/')}/gsql/v1/tokens",
        auth=(TG_USERNAME, TG_PASSWORD),
        json={"secret": TG_SECRET, "lifetime": 2592000},
        verify=False,
        timeout=20,
    )
    token_resp.raise_for_status()
    token_data = token_resp.json()
    token = token_data.get("token", "")
    if not token:
        raise RuntimeError(f"Token response missing token field: {token_data}")
    return token


def _is_restpp_token_valid(token):
    check_url = f"{TG_HOST.rstrip('/')}:443/restpp/graph/{TG_GRAPH}/vertices"
    resp = requests.get(
        check_url,
        headers={"Authorization": f"Bearer {token}"},
        verify=False,
        timeout=20,
    )
    if resp.status_code != 403:
        return True
    body = ""
    try:
        body = resp.text or ""
    except Exception:
        body = ""
    return "REST-10016" not in body


def init_tg():
    """Initialize pyTigerGraph connection."""
    conn_kwargs = {
        "host": TG_HOST,
        "username": TG_USERNAME,
        "password": TG_PASSWORD,
        "graphname": TG_GRAPH,
        "restppPort": "443",
        "gsPort": "443",
    }
    conn = tg.TigerGraphConnection(**conn_kwargs)
    if TG_TOKEN and _is_restpp_token_valid(TG_TOKEN):
        conn.apiToken = TG_TOKEN
        return conn

    if TG_SECRET:
        try:
            conn.apiToken = _generate_token_from_secret()
            return conn
        except Exception as e:
            raise RuntimeError(
                "Failed to create TigerGraph API token via secret. "
                "Tried GSQL endpoint /gsql/v1/tokens. "
                "Verify TIGERGRAPH_SECRET and user permissions in TigerGraph Cloud."
            ) from e

    return conn


def fetch_myscheme_data(size=100):
    """Fetch a larger set of schemes from myScheme.gov.in."""
    print(f"Fetching {size} schemes from myScheme...")
    try:
        params = urllib.parse.urlencode(
            {
                "lang": "en",
                "from": "0",
                "size": str(size),
                "q": json.dumps(
                    [{"identifier": "gender", "value": "All"}]
                ),  # Broad search
            }
        )
        url = f"{MYSCHEME_API_BASE}?{params}"
        headers = {
            "Accept": "application/json",
            "Origin": "https://www.myscheme.gov.in",
            "Referer": "https://www.myscheme.gov.in/",
        }
        if MYSCHEME_API_KEY:
            headers["X-API-Key"] = MYSCHEME_API_KEY

        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        return data.get("data", {}).get("hits", {}).get("items", [])
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        print(f"Error fetching from myScheme: HTTP {e.code} {e.reason}. {body[:200]}")
        return []
    except Exception as e:
        print(f"Error fetching from myScheme: {e}")
        return []


def ingest():
    """Ingest data into TigerGraph."""
    try:
        conn = init_tg()
        print(f"Connected to TigerGraph: {TG_HOST}")

        # 1. Load Local Schemes
        local_path = (
            Path(__file__).parent.parent.parent
            / "frontend"
            / "src"
            / "data"
            / "schemes.json"
        )
        with open(local_path, "r", encoding="utf-8") as f:
            local_schemes = json.load(f)

        max_local = int(os.environ.get("TG_MAX_LOCAL_SCHEMES", "0") or "0")
        if max_local > 0:
            local_schemes = local_schemes[:max_local]
            print(
                f"Ingesting first {len(local_schemes)} local schemes (TG_MAX_LOCAL_SCHEMES enabled)..."
            )
        else:
            print(f"Ingesting {len(local_schemes)} local schemes...")
        for idx, s in enumerate(local_schemes, start=1):
            # Upsert Scheme Vertex
            conn.upsertVertex(
                "Scheme",
                s["id"],
                attributes={
                    "name": s["name"],
                    "name_hindi": s.get("nameHindi", ""),
                    "description": s["description"],
                    "amount": 0.0,  # Placeholder
                    "category": s["category"],
                    "ministry": s.get("ministry", ""),
                    "portal_url": s.get("applicationUrl", ""),
                },
            )

            # Upsert Document Vertices and Edges
            for doc_name in s.get("documentsRequired", []):
                doc_id = doc_name.lower().replace(" ", "_")
                conn.upsertVertex("Document", doc_id, attributes={"name": doc_name})
                conn.upsertEdge(
                    "Scheme", s["id"], "REQUIRES_DOCUMENT", "Document", doc_id
                )

            if idx % 5 == 0 or idx == len(local_schemes):
                print(f"  Progress: {idx}/{len(local_schemes)} local schemes ingested")

        # 2. Load myScheme Data
        myscheme_items = fetch_myscheme_data(size=50)
        print(f"Ingesting {len(myscheme_items)} myScheme entries...")
        for item in myscheme_items:
            fields = item.get("fields", {})
            s_id = fields.get("slug", str(hash(fields.get("schemeName", ""))))
            conn.upsertVertex(
                "Scheme",
                s_id,
                attributes={
                    "name": fields.get("schemeName", ""),
                    "description": fields.get("briefDescription", "")[:500],
                    "category": fields.get("category", "Other"),
                    "ministry": fields.get("nodalMinistryName", ""),
                    "portal_url": f"https://www.myscheme.gov.in/schemes/{s_id}",
                },
            )

        print("Ingestion complete!")
    except requests.exceptions.HTTPError as e:
        body = ""
        try:
            body = e.response.text or ""
        except Exception:
            body = ""

        if "Failed to start workspace" in body or "Auto start is not enabled" in body:
            print(
                "Ingestion failed: TigerGraph workspace is stopped and auto-start is disabled. "
                "Open TigerGraph Cloud -> your cluster/workspace -> click Start, then rerun."
            )
            return

        if "REST-10016" in body:
            print(
                "Ingestion failed: TigerGraph token is invalid for RESTPP. "
                "Clear TIGERGRAPH_TOKEN and keep a valid TIGERGRAPH_SECRET so the script can auto-generate a token."
            )
            return

        if "REST-10018" in body:
            print(
                "Ingestion failed: token exists but lacks graph write privileges (CREATE/UPDATE on graph). "
                "Grant Data Access privileges on graph and rerun."
            )
            return

        if "REST-30200" in body or "REST-30000" in body:
            print(
                "Ingestion failed: graph schema missing required vertex/edge types (Scheme/Document/REQUIRES_DOCUMENT). "
                "Create schema in graph and rerun."
            )
            return

        print(f"Ingestion failed: {e}")
    except Exception as e:
        print(f"Ingestion failed: {e}")


if __name__ == "__main__":
    ingest()
