from pydantic import BaseModel

from app.schemas.players import PlayerListItemOut
from app.services.price_trends import PriceDirection


class SuggestedTransferOut(BaseModel):
    outPlayer: PlayerListItemOut
    inPlayer: PlayerListItemOut
    # What outPlayer would actually sell for (see lineup.py's _resell_price)
    # — only half of any price rise is realized, so this can be less than
    # outPlayer.currentPrice. The frontend needs this to preview the bank
    # impact of applying the suggestion, same as a manual transfer does.
    outPlayerSellingPrice: int
    # inPlayer's projected score minus outPlayer's (see services/suggestions.py
    # for the formula) — a rough "points per gameweek" delta, not a point
    # guarantee.
    projectedGain: float
    # True when accepting this suggestion would cost a -4 hit (i.e. it's
    # beyond this gameweek's free transfers) — the frontend labels these
    # distinctly rather than the score trying to net the cost in.
    requiresHit: bool
    # Whether each side's price has already moved today (see
    # services/price_trends.py) — the realized move only, not a prediction.
    # Carried here rather than on PlayerListItemOut so search results don't
    # grow a field only this panel shows.
    outPlayerPriceDirection: PriceDirection
    inPlayerPriceDirection: PriceDirection


class SuggestionsOut(BaseModel):
    suggestions: list[SuggestedTransferOut]
    freeTransfersAvailable: int
