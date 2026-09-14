from pydantic import BaseModel


class ImportTeamRequest(BaseModel):
    userId: str
    fplTeamId: int


class SquadPlayerOut(BaseModel):
    playerId: int
    webName: str
    position: str
    club: str
    clubCode: int | None
    currentPrice: int
    purchasePrice: int
    sellingPrice: int
    isStarting: bool
    squadPosition: int
    isCaptain: bool
    isViceCaptain: bool


class SquadOut(BaseModel):
    fplTeamId: int
    teamName: str | None
    managerName: str | None
    gameweek: int
    bank: int
    teamValue: int
    players: list[SquadPlayerOut]
