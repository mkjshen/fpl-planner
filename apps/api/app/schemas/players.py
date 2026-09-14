from pydantic import BaseModel


class PlayerListItemOut(BaseModel):
    playerId: int
    webName: str
    position: str
    club: str
    clubCode: int | None
    currentPrice: int
    status: str


class PlayerListOut(BaseModel):
    total: int
    players: list[PlayerListItemOut]
