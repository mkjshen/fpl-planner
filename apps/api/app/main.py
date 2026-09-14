from fastapi import FastAPI

from app.routers import players, teams

app = FastAPI(title="FPL Planner API")
app.include_router(teams.router)
app.include_router(players.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
