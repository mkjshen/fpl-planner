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


class ChipWindowOut(BaseModel):
    startEvent: int
    stopEvent: int
    # "used" — spent, by real history or another gameweek's plan.
    # "available" — not spent, and not yet past its stopEvent.
    # "expired" — never used and its stopEvent has already passed; lost for
    # the rest of the season, same as a real unused chip window.
    status: str


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
    # Every usage window each chip type has this season (real FPL gives
    # each chip two: first half and second half), each with its own status.
    # A chip not offered this season is simply absent.
    chipWindows: dict[str, list[ChipWindowOut]] = {}
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
