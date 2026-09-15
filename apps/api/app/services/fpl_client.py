import httpx

from app.schemas.fpl_api import (
    FplBootstrap,
    FplEntry,
    FplFixture,
    FplHistoryResponse,
    FplLiveResponse,
    FplPicksResponse,
    FplTransfer,
)

BASE_URL = "https://fantasy.premierleague.com/api"


class FplTeamNotFoundError(Exception):
    def __init__(self, fpl_team_id: int):
        self.fpl_team_id = fpl_team_id
        super().__init__(f"FPL team {fpl_team_id} not found")


class FplPicksUnavailableError(Exception):
    """The team exists but has no picks published for the requested
    gameweek yet (e.g. the deadline for the current gameweek hasn't
    passed). Distinct from FplTeamNotFoundError, which the picks endpoint
    also 404s on for a genuinely unknown team — that case is ruled out
    here because import_team always resolves the team via get_entry
    first."""

    def __init__(self, fpl_team_id: int, event: int):
        self.fpl_team_id = fpl_team_id
        self.event = event
        super().__init__(f"FPL team {fpl_team_id} has no picks for event {event}")


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
        # A 404 here means "no picks for this event" (deadline hasn't
        # passed, or the team didn't exist yet at that event) — it does
        # NOT mean the team itself is unknown, unlike every other 404 in
        # this client. Callers that already resolved the team via
        # get_entry should treat this as FplPicksUnavailableError.
        response = await self._client.get(f"/entry/{fpl_team_id}/event/{event}/picks/")
        if response.status_code == 404:
            raise FplPicksUnavailableError(fpl_team_id, event)
        response.raise_for_status()
        return FplPicksResponse.model_validate(response.json())

    async def get_entry_transfers(self, fpl_team_id: int) -> list[FplTransfer]:
        response = await self._client.get(f"/entry/{fpl_team_id}/transfers/")
        if response.status_code == 404:
            raise FplTeamNotFoundError(fpl_team_id)
        response.raise_for_status()
        return [FplTransfer.model_validate(item) for item in response.json()]

    async def get_entry_history(self, fpl_team_id: int) -> FplHistoryResponse:
        response = await self._client.get(f"/entry/{fpl_team_id}/history/")
        if response.status_code == 404:
            raise FplTeamNotFoundError(fpl_team_id)
        response.raise_for_status()
        return FplHistoryResponse.model_validate(response.json())

    async def get_fixtures(self) -> list[FplFixture]:
        # The whole season's fixtures, not team-specific — no event filter.
        response = await self._client.get("/fixtures/")
        response.raise_for_status()
        return [FplFixture.model_validate(item) for item in response.json()]

    async def get_event_live(self, event: int) -> FplLiveResponse:
        # Every player's actual stats for one specific past/current
        # gameweek — used to show a squad player's real points once their
        # fixture has finished, instead of who they're playing.
        response = await self._client.get(f"/event/{event}/live/")
        response.raise_for_status()
        return FplLiveResponse.model_validate(response.json())
