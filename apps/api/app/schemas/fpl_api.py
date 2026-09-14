"""Pydantic models for the subset of fields we use from the official
FPL API (fantasy.premierleague.com/api). These are external, unversioned
responses — validation here is what protects the importer from silently
ingesting malformed or unexpected data.
"""

from datetime import datetime

from pydantic import BaseModel


class FplEvent(BaseModel):
    id: int
    deadline_time: datetime
    is_current: bool
    is_next: bool
    finished: bool


class FplClub(BaseModel):
    id: int
    code: int
    name: str
    short_name: str


class FplElement(BaseModel):
    id: int
    team: int
    web_name: str
    first_name: str
    second_name: str
    element_type: int
    now_cost: int
    status: str


class FplChip(BaseModel):
    name: str


class FplBootstrap(BaseModel):
    events: list[FplEvent]
    teams: list[FplClub]
    elements: list[FplElement]
    chips: list[FplChip]


class FplEntry(BaseModel):
    id: int
    name: str
    player_first_name: str
    player_last_name: str
    current_event: int | None = None


class FplPick(BaseModel):
    element: int
    position: int
    multiplier: int
    is_captain: bool
    is_vice_captain: bool


class FplEntryHistory(BaseModel):
    event: int
    bank: int
    value: int
    event_transfers: int
    event_transfers_cost: int


class FplPicksResponse(BaseModel):
    entry_history: FplEntryHistory
    picks: list[FplPick]


class FplTransfer(BaseModel):
    element_in: int
    element_out: int
    event: int
    time: datetime


class FplChipUsage(BaseModel):
    name: str
    event: int


class FplHistoryResponse(BaseModel):
    # `current` entries carry more fields (points, rank, ...) than
    # FplEntryHistory declares — Pydantic ignores the rest, we only need
    # event_transfers for the free-transfer rollover.
    current: list[FplEntryHistory]
    chips: list[FplChipUsage]
