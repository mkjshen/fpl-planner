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
    # Who this player's club faces in the gameweek being viewed — e.g.
    # "MUN (H)", "MUN (H), LIV (A)" for a double gameweek, or "No fixture"
    # for a blank one. More relevant here than their own club, which the
    # shirt already shows.
    opponent: str
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
