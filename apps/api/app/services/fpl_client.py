import httpx

from app.schemas.fpl_api import FplBootstrap, FplEntry, FplPicksResponse, FplTransfer

BASE_URL = "https://fantasy.premierleague.com/api"


class FplTeamNotFoundError(Exception):
    def __init__(self, fpl_team_id: int):
        self.fpl_team_id = fpl_team_id
        super().__init__(f"FPL team {fpl_team_id} not found")


class FplClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=BASE_URL, timeout=15.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "FplClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def get_bootstrap_static(self) -> FplBootstrap:
        response = await self._client.get("/bootstrap-static/")
        response.raise_for_status()
        return FplBootstrap.model_validate(response.json())

    async def get_entry(self, fpl_team_id: int) -> FplEntry:
        response = await self._client.get(f"/entry/{fpl_team_id}/")
        if response.status_code == 404:
            raise FplTeamNotFoundError(fpl_team_id)
        response.raise_for_status()
        return FplEntry.model_validate(response.json())

    async def get_entry_picks(self, fpl_team_id: int, event: int) -> FplPicksResponse:
        response = await self._client.get(f"/entry/{fpl_team_id}/event/{event}/picks/")
        if response.status_code == 404:
            raise FplTeamNotFoundError(fpl_team_id)
        response.raise_for_status()
        return FplPicksResponse.model_validate(response.json())

    async def get_entry_transfers(self, fpl_team_id: int) -> list[FplTransfer]:
        response = await self._client.get(f"/entry/{fpl_team_id}/transfers/")
        if response.status_code == 404:
            raise FplTeamNotFoundError(fpl_team_id)
        response.raise_for_status()
        return [FplTransfer.model_validate(item) for item in response.json()]
