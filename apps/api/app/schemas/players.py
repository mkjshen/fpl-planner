from pydantic import BaseModel


class PlayerListItemOut(BaseModel):
    playerId: int
    webName: str
    position: str
    club: str
    clubCode: int | None
    currentPrice: int
    status: str
    # The same handful of fields search_players can sort by (see SORT_COLUMNS
    # in services/players.py) — carried on every row, not just the one being
    # sorted by, so switching "sort by" doesn't need a second round trip and
    # the row can always show *why* it's where it is in the list.
    form: float
    totalPoints: int
    pointsPerGame: float
    ictIndex: float
    valueSeason: float
    selectedByPercent: float


class PlayerListOut(BaseModel):
    total: int
    players: list[PlayerListItemOut]


class PlayerProfileOut(BaseModel):
    """Everything the player profile modal shows — fetched on demand (one
    player at a time, only when its info icon is clicked) rather than
    folded into PlayerListItemOut, so browsing/searching the full player
    pool doesn't carry stats nobody's asked to see yet."""

    playerId: int
    webName: str
    fullName: str
    position: str
    club: str
    clubCode: int | None
    # Numeric photo code, not a full URL — mirrors how PlayerCard already
    # builds shirt image URLs client-side from clubCode (see pitch.tsx's
    # shirtUrl) rather than baking a resources.premierleague.com URL
    # convention into the API response.
    photoCode: int | None
    currentPrice: int
    status: str
    # 0-100, null means "no doubt" (fully fit) — same meaning as the raw
    # FPL API field.
    chanceOfPlayingNextRound: int | None
    news: str
    form: float
    totalPoints: int
    pointsPerGame: float
    selectedByPercent: float
    minutes: int
    goalsScored: int
    assists: int
    cleanSheets: int
    bonus: int
    ictIndex: float
    expectedGoals: float
    expectedAssists: float
    valueSeason: float
