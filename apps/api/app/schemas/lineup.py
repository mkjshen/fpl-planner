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
    players: list[SquadPlayerOut]


class LineupPlayerInput(BaseModel):
    playerId: int
    isStarting: bool
    squadPosition: int
    isCaptain: bool
    isViceCaptain: bool


class LineupUpdateRequest(BaseModel):
    players: list[LineupPlayerInput]
