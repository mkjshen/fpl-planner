"""Price-change risk signals, built from fields imported straight off
FPL's own bootstrap snapshot (see importer._upsert_clubs_and_players).
`transfersInEvent`/`transfersOutEvent` are stored alongside `costChangeEvent`
for a future risk-scoring pass (e.g. "large net transfers in with no price
rise yet"), but FPL's own threshold for when momentum actually tips a price
is undocumented — this module only classifies the realized direction,
rather than guessing at a prediction model for the unrealized one."""

from typing import Literal

PriceDirection = Literal["risen", "fallen", "unchanged"]


def price_direction(cost_change_event: int | None) -> PriceDirection:
    """Whether a player's price has already moved today, per FPL's own
    signed costChangeEvent (positive = risen, negative = fallen). None (a
    row imported before this field existed, not yet refreshed by a later
    import) is treated the same as a real zero rather than guessed at."""
    if not cost_change_event:
        return "unchanged"
    return "risen" if cost_change_event > 0 else "fallen"
