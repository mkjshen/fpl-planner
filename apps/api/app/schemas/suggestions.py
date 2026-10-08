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
    # projectedGain averaged over the horizon — the figure the UI shows,
    # since managers think in points per gameweek, not five-week totals.
    projectedGainPerGameweek: float
    # Whether the outgoing player is in the starting XI. projectedGain is
    # already scaled down for a bench slot (its points rarely count); this
    # lets the UI say so instead of leaving a small number unexplained.
    outPlayerStarting: bool
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


class TransferCombinationOut(BaseModel):
    """The best *set* of transfers chosen jointly (see
    services/transfer_optimizer.py), as opposed to `suggestions`' independent
    one-for-one picks — budget, club limit and hits are satisfied by the set
    as a whole, so it can include moves that only make sense together (e.g.
    a downgrade that funds an upgrade elsewhere). Pairs are same-position;
    which outgoing player is paired with which incoming one within a
    position is presentational, since every constraint is on the final
    squad."""

    transfers: list[SuggestedTransferOut]
    totalProjectedGain: float
    # How many of `transfers` go beyond the free allowance, each costing -4.
    hits: int
    # totalProjectedGain minus 4 per hit.
    netProjectedGain: float
    # netProjectedGain averaged over the horizon (what the UI shows).
    netProjectedGainPerGameweek: float


class SuggestionsOut(BaseModel):
    suggestions: list[SuggestedTransferOut]
    freeTransfersAvailable: int
    # How many gameweeks (from the requested one) projectedGain covers.
    horizonGameweeks: int
    # None when no transfer is worth making, or the solver didn't finish.
    bestCombination: TransferCombinationOut | None
