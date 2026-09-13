from fastapi import FastAPI

app = FastAPI(title="FPL Planner API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
