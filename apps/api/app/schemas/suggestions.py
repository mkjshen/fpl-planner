from pydantic import BaseModel

from app.schemas.players import PlayerListItemOut
from app.services.price_trends import PriceDirection


class GameweekProjectionOut(BaseModel):
    """One gameweek of a suggestion's horizon — the per-fixture inputs and
    resulting projected points for each side, so the UI can show *why* a
    swap is favored (e.g. an easy run, or a double) instead of one opaque
    total."""

    gameweekNumber: int
    # FPL's 1 (easiest) - 5 (hardest) rating, one entry per fixture: empty
    # on a blank gameweek, two entries on a double.
    outDifficulties: list[int]
    inDifficulties: list[int]
    # Already down-weighted for how far out this gameweek is (see
    # services/suggestions.py:_horizon_projection), so these sum exactly to
    # each side's horizon total.
    outProjectedPoints: float
    inProjectedPoints: float


class SuggestedTransferOut(BaseModel):
    outPlayer: PlayerListItemOut
    inPlayer: PlayerListItemOut
    # What outPlayer would actually sell for (see lineup.py's _resell_price)
    # — only half of any price rise is realized, so this can be less than
    # outPlayer.currentPrice. The frontend needs this to preview the bank
    # impact of applying the suggestion, same as a manual transfer does.
    outPlayerSellingPrice: int
    # inPlayer's projected points minus outPlayer's, summed over the next
    # horizonGameweeks gameweeks (see services/suggestions.py for the
    # formula) — a rough estimate, not a point guarantee. Not netted against
    # a -4 hit; requiresHit flags that separately.
    projectedGain: float
    # True when this suggestion ranks beyond this gameweek's free transfers,
    # i.e. it would cost a -4 hit *if the list were taken in rank order*.
    # That's what decides whether it needs the higher MIN_GAIN_TO_JUSTIFY_HIT
    # bar to be listed at all. The planner doesn't display it as-is — it
    # labels a hit from the transfers actually made so far, since applying
    # only a lower-ranked suggestion on its own is still free.
    requiresHit: bool
    # Whether each side's price has already moved today (see
    # services/price_trends.py) — the realized move only, not a prediction.
    # Carried here rather than on PlayerListItemOut so search results don't
    # grow a field only this panel shows.
    outPlayerPriceDirection: PriceDirection
    inPlayerPriceDirection: PriceDirection
    gameweekProjections: list[GameweekProjectionOut]


class SuggestionsOut(BaseModel):
    suggestions: list[SuggestedTransferOut]
    freeTransfersAvailable: int
    # How many gameweeks (from the requested one) projectedGain covers.
    horizonGameweeks: int
