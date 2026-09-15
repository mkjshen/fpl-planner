"""API-level smoke test — no DB required (the /health endpoint doesn't
touch it). A fuller suite would override the get_db dependency to run
endpoint tests against the test database too; not needed yet for a single
DB-independent route."""


async def test_health_endpoint_reports_ok(client):
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
