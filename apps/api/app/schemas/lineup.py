from datetime import datetime

from pydantic import BaseModel

from app.schemas.squad import SquadPlayerOut


class GameweekOut(BaseModel):
    number: int
    deadlineTime: datetime
    isCurrent: bool
    isNext: bool
    isFinished: bool


class PlannableGameweeksOut(BaseModel):
    currentGameweek: int | None
    plannable: list[GameweekOut]


class LineupOut(BaseModel):
    fplTeamId: int
    teamName: str | None
    managerName: str | None
    gameweek: int
    isEditable: bool
    bank: int
    teamValue: int
    freeTransfers: int
    transferCost: int
    laterPlansAffected: bool = False
    # The chip activated on this specific gameweek's own saved plan, if
    # any — never a chip inherited from an earlier cascaded plan.
    chipUsed: str | None = None
    # How many uses of each chip type remain this season (already excludes
    # real past usage and every other gameweek's planned usage), keyed by
    # chip name. A chip not offered this season is simply absent.
    chipsRemaining: dict[str, int] = {}
    players: list[SquadPlayerOut]


class LineupPlayerInput(BaseModel):
    playerId: int
    isStarting: bool
    squadPosition: int
    isCaptain: bool
    isViceCaptain: bool


class LineupUpdateRequest(BaseModel):
    players: list[LineupPlayerInput]
    # None clears any chip previously saved for this gameweek's plan.
    chip: str | None = None
