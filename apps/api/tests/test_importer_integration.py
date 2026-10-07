"""Integration tests for app/services/importer.py's _record_price_history
against a real Postgres database (see conftest.py's db_session fixture) —
exercises the actual "compare against what's already stored" query that a
pure-function test can't reach."""

from sqlalchemy import select

from app.db.models import Club, Player, PlayerPriceHistory, Position
from app.schemas.fpl_api import FplBootstrap, FplElement
from app.services.importer import _record_price_history


def _club(club_id: int) -> Club:
    return Club(id=club_id, code=club_id, name=f"Club {club_id}", shortName=f"C{club_id}")


def _player(player_id: int, club_id: int, price: int) -> Player:
    return Player(
        id=player_id,
        clubId=club_id,
        webName=f"Player{player_id}",
        fullName=f"Player {player_id}",
        position=Position.MID,
        currentPrice=price,
        status="a",
    )


def _element(element_id: int, now_cost: int, **overrides) -> FplElement:
    defaults = dict(
        team=1,
        web_name=f"Player{element_id}",
        first_name="First",
        second_name="Last",
        element_type=3,
        status="a",
        photo=f"{element_id}.jpg",
        form=0.0,
        total_points=0,
        points_per_game=0.0,
        selected_by_percent=0.0,
        minutes=0,
        goals_scored=0,
        assists=0,
        clean_sheets=0,
        bonus=0,
        ict_index=0.0,
        expected_goals=0.0,
        expected_assists=0.0,
        value_season=0.0,
        chance_of_playing_next_round=None,
        news="",
        transfers_in_event=0,
        transfers_out_event=0,
        cost_change_event=0,
    )
    defaults.update(overrides)
    return FplElement(id=element_id, now_cost=now_cost, **defaults)


def _bootstrap(elements: list[FplElement]) -> FplBootstrap:
    return FplBootstrap(events=[], teams=[], elements=elements, chips=[])


async def _history_prices(db_session, player_id: int) -> list[int]:
    result = await db_session.execute(
        select(PlayerPriceHistory.price).where(PlayerPriceHistory.playerId == player_id)
    )
    return [row[0] for row in result.all()]


async def test_a_player_with_no_history_gets_a_baseline_row(db_session):
    db_session.add(_club(1))
    db_session.add(_player(1, 1, price=55))
    await db_session.commit()

    await _record_price_history(db_session, _bootstrap([_element(1, now_cost=55)]))
    await db_session.commit()

    assert await _history_prices(db_session, 1) == [55]


async def test_an_unchanged_price_does_not_add_a_second_row(db_session):
    db_session.add(_club(1))
    db_session.add(_player(1, 1, price=55))
    await db_session.commit()
    await _record_price_history(db_session, _bootstrap([_element(1, now_cost=55)]))
    await db_session.commit()

    # Same price again, as a later import would report it.
    await _record_price_history(db_session, _bootstrap([_element(1, now_cost=55)]))
    await db_session.commit()

    assert await _history_prices(db_session, 1) == [55]


async def test_a_changed_price_appends_a_new_row_on_top_of_the_baseline(db_session):
    db_session.add(_club(1))
    db_session.add(_player(1, 1, price=55))
    await db_session.commit()
    await _record_price_history(db_session, _bootstrap([_element(1, now_cost=55)]))
    await db_session.commit()

    # Player.currentPrice hasn't moved yet (that happens in
    # _upsert_clubs_and_players, not this function) — this is exactly the
    # "price about to be overwritten" read the function relies on.
    await _record_price_history(db_session, _bootstrap([_element(1, now_cost=56)]))
    await db_session.commit()

    assert await _history_prices(db_session, 1) == [55, 56]


async def test_a_brand_new_element_with_no_player_row_yet_is_skipped_without_error(db_session):
    # Regression test for a real bug found by hand this session: a
    # mid-season new FPL element (confirmed against the live API — ids
    # do appear that aren't in this app's Player table yet) has no Player
    # row for _upsert_clubs_and_players to have created yet at the point
    # this function runs, so inserting a PlayerPriceHistory row for it
    # would violate the playerId foreign key. No Club/Player seeded at all.
    await _record_price_history(db_session, _bootstrap([_element(999, now_cost=50)]))
    await db_session.commit()

    assert await _history_prices(db_session, 999) == []


async def test_two_players_are_tracked_independently(db_session):
    db_session.add(_club(1))
    db_session.add(_player(1, 1, price=55))
    db_session.add(_player(2, 1, price=70))
    await db_session.commit()

    await _record_price_history(
        db_session, _bootstrap([_element(1, now_cost=55), _element(2, now_cost=70)])
    )
    await db_session.commit()

    assert await _history_prices(db_session, 1) == [55]
    assert await _history_prices(db_session, 2) == [70]
