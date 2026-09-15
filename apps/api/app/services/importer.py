from datetime import datetime, timedelta, timezone

from sqlalchemy import bindparam, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ChipUsage,
    ChipWindow,
    Club,
    Fixture,
    FplTeam,
    Gameweek,
    Player,
    Position,
    Season,
    SquadPlayer,
    SquadSnapshot,
    TransferHistory,
)
from app.schemas.fpl_api import (
    FplBootstrap,
    FplChipUsage,
    FplEntry,
    FplFixture,
    FplLiveResponse,
    FplPicksResponse,
    FplTransfer,
)
from app.services.fpl_client import FplClient, FplTeamNotFoundError

ELEMENT_TYPE_TO_POSITION = {
    1: Position.GK,
    2: Position.DEF,
    3: Position.MID,
    4: Position.FWD,
}

CHIP_NAME_MAP = {
    "wildcard": "wildcard",
    "freehit": "free_hit",
    "bboost": "bench_boost",
    "3xc": "triple_captain",
}

# The FPL API doesn't expose these as data — they're game rules that have
# changed between seasons. Confirmed against the live 2026/27 season rules
# (1 free transfer/gameweek, rollover capped at 5, no mid-season bump this
# season) as of 2026-09-15 — re-verify if a season boundary has passed.
FREE_TRANSFER_CAP = 1
FREE_TRANSFER_ROLLOVER_LIMIT = 5


def _season_label(bootstrap: FplBootstrap) -> str:
    start_year = min(e.deadline_time for e in bootstrap.events).year
    return f"{start_year}/{str(start_year + 1)[-2:]}"


async def _upsert_season(db: AsyncSession, bootstrap: FplBootstrap) -> Season:
    label = _season_label(bootstrap)
    chips_available = sorted({CHIP_NAME_MAP.get(c.name, c.name) for c in bootstrap.chips})

    existing = await db.scalar(select(Season).where(Season.label == label))
    if existing:
        existing.isCurrent = True
        existing.chipsAvailable = chips_available
        return existing

    season = Season(
        label=label,
        isCurrent=True,
        freeTransferCap=FREE_TRANSFER_CAP,
        freeTransferRolloverLimit=FREE_TRANSFER_ROLLOVER_LIMIT,
        chipsAvailable=chips_available,
    )
    db.add(season)
    await db.flush()
    return season


async def _upsert_chip_windows(db: AsyncSession, season: Season, bootstrap: FplBootstrap) -> None:
    """Each chip's usable gameweek windows this season. The bootstrap
    "chips" list has one entry per window (e.g. separate first-half and
    second-half "wildcard" entries, each with its own start_event/
    stop_event) — a window is single-use and doesn't roll into the next
    one, so this is the real per-season shape, not just a count."""
    rows = [
        {
            "seasonId": season.id,
            "chip": CHIP_NAME_MAP.get(c.name, c.name),
            "startEvent": c.start_event,
            "stopEvent": c.stop_event,
        }
        for c in bootstrap.chips
    ]
    if not rows:
        return
    stmt = pg_insert(ChipWindow).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[ChipWindow.seasonId, ChipWindow.chip, ChipWindow.startEvent],
        set_={"stopEvent": stmt.excluded.stopEvent},
    )
    await db.execute(stmt)
    await db.flush()


async def _upsert_gameweeks(
    db: AsyncSession, season: Season, bootstrap: FplBootstrap
) -> dict[int, Gameweek]:
    result = await db.execute(select(Gameweek).where(Gameweek.seasonId == season.id))
    existing_by_number = {gw.number: gw for gw in result.scalars().all()}

    gameweeks: dict[int, Gameweek] = {}
    for event in bootstrap.events:
        deadline_time = _as_naive_utc(event.deadline_time)
        gw = existing_by_number.get(event.id)
        if gw:
            gw.deadlineTime = deadline_time
            gw.isCurrent = event.is_current
            gw.isNext = event.is_next
            gw.isFinished = event.finished
        else:
            gw = Gameweek(
                seasonId=season.id,
                number=event.id,
                deadlineTime=deadline_time,
                isCurrent=event.is_current,
                isNext=event.is_next,
                isFinished=event.finished,
            )
            db.add(gw)
        gameweeks[event.id] = gw

    await db.flush()
    return gameweeks


def _photo_code(photo: str) -> int | None:
    """The FPL API's "photo" field is a filename like "154561.jpg" — the
    numeric part is what builds a portrait URL at
    resources.premierleague.com/premierleague/photos/players/110x140/p{code}.png
    (confirmed against the live API, not assumed). None on anything
    unexpected rather than failing the whole import over one player's
    portrait."""
    try:
        return int(photo.split(".")[0])
    except (ValueError, IndexError):
        return None


async def _upsert_clubs_and_players(db: AsyncSession, bootstrap: FplBootstrap) -> None:
    if bootstrap.teams:
        club_rows = [
            {"id": t.id, "code": t.code, "name": t.name, "shortName": t.short_name}
            for t in bootstrap.teams
        ]
        stmt = pg_insert(Club).values(club_rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Club.id],
            set_={
                "code": stmt.excluded.code,
                "name": stmt.excluded.name,
                "shortName": stmt.excluded.shortName,
            },
        )
        await db.execute(stmt)

    if bootstrap.elements:
        player_rows = [
            {
                "id": e.id,
                "clubId": e.team,
                "webName": e.web_name,
                "fullName": f"{e.first_name} {e.second_name}".strip(),
                "position": ELEMENT_TYPE_TO_POSITION[e.element_type],
                "currentPrice": e.now_cost,
                "status": e.status,
                "photoCode": _photo_code(e.photo),
                "form": e.form,
                "totalPoints": e.total_points,
                "pointsPerGame": e.points_per_game,
                "selectedByPercent": e.selected_by_percent,
                "minutes": e.minutes,
                "goalsScored": e.goals_scored,
                "assists": e.assists,
                "cleanSheets": e.clean_sheets,
                "bonus": e.bonus,
                "ictIndex": e.ict_index,
                "expectedGoals": e.expected_goals,
                "expectedAssists": e.expected_assists,
                "valueSeason": e.value_season,
                "chanceOfPlayingNextRound": e.chance_of_playing_next_round,
                "news": e.news,
            }
            for e in bootstrap.elements
        ]
        stmt = pg_insert(Player).values(player_rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Player.id],
            set_={
                "clubId": stmt.excluded.clubId,
                "webName": stmt.excluded.webName,
                "fullName": stmt.excluded.fullName,
                "position": stmt.excluded.position,
                "currentPrice": stmt.excluded.currentPrice,
                "status": stmt.excluded.status,
                "photoCode": stmt.excluded.photoCode,
                "form": stmt.excluded.form,
                "totalPoints": stmt.excluded.totalPoints,
                "pointsPerGame": stmt.excluded.pointsPerGame,
                "selectedByPercent": stmt.excluded.selectedByPercent,
                "minutes": stmt.excluded.minutes,
                "goalsScored": stmt.excluded.goalsScored,
                "assists": stmt.excluded.assists,
                "cleanSheets": stmt.excluded.cleanSheets,
                "bonus": stmt.excluded.bonus,
                "ictIndex": stmt.excluded.ictIndex,
                "expectedGoals": stmt.excluded.expectedGoals,
                "expectedAssists": stmt.excluded.expectedAssists,
                "valueSeason": stmt.excluded.valueSeason,
                "chanceOfPlayingNextRound": stmt.excluded.chanceOfPlayingNextRound,
                "news": stmt.excluded.news,
            },
        )
        await db.execute(stmt)


async def _upsert_fpl_team(
    db: AsyncSession, user_id: str, fpl_team_id: int, entry: FplEntry
) -> FplTeam:
    fpl_team = await db.scalar(
        select(FplTeam).where(FplTeam.userId == user_id, FplTeam.fplTeamId == fpl_team_id)
    )
    manager_name = f"{entry.player_first_name} {entry.player_last_name}".strip()
    if fpl_team:
        fpl_team.teamName = entry.name
        fpl_team.managerName = manager_name
    else:
        fpl_team = FplTeam(
            userId=user_id,
            fplTeamId=fpl_team_id,
            teamName=entry.name,
            managerName=manager_name,
        )
        db.add(fpl_team)
    await db.flush()
    return fpl_team


async def _replace_snapshot(
    db: AsyncSession,
    fpl_team: FplTeam,
    gameweek: Gameweek,
    picks: FplPicksResponse,
) -> SquadSnapshot:
    snapshot = await db.scalar(
        select(SquadSnapshot).where(
            SquadSnapshot.fplTeamId == fpl_team.id, SquadSnapshot.gameweekId == gameweek.id
        )
    )
    player_prices = await _load_player_prices(db, {pick.element for pick in picks.picks})

    # Ours is squad current-price value only, bank tracked separately — not
    # FPL's own entry_history.value, which bakes in each player's selling
    # price rather than current price wherever they've risen in value, so
    # it wouldn't stay internally consistent with how transfers move this
    # figure (currentPrice in, currentPrice out — see save_lineup).
    squad_value = sum(player_prices.get(pick.element, 0) for pick in picks.picks)
    if snapshot:
        await db.execute(SquadPlayer.__table__.delete().where(SquadPlayer.snapshotId == snapshot.id))
        snapshot.bank = picks.entry_history.bank
        snapshot.teamValue = squad_value
    else:
        snapshot = SquadSnapshot(
            fplTeamId=fpl_team.id,
            gameweekId=gameweek.id,
            bank=picks.entry_history.bank,
            teamValue=squad_value,
        )
        db.add(snapshot)
    await db.flush()

    for pick in picks.picks:
        # FPL's picks endpoint doesn't return purchase price — only current
        # price is known. Treat "just imported" as "bought today" (the only
        # honest basis available); this understates real profit/loss for
        # players the manager has held since before they were tracked here.
        price = player_prices.get(pick.element, 0)
        db.add(
            SquadPlayer(
                snapshotId=snapshot.id,
                playerId=pick.element,
                purchasePrice=price,
                sellingPrice=price,
                isStarting=pick.position <= 11,
                squadPosition=pick.position,
                isCaptain=pick.is_captain,
                isViceCaptain=pick.is_vice_captain,
            )
        )
    await db.flush()
    return snapshot


async def _load_player_prices(db: AsyncSession, player_ids: set[int]) -> dict[int, int]:
    result = await db.execute(select(Player.id, Player.currentPrice).where(Player.id.in_(player_ids)))
    return dict(result.all())


def _as_naive_utc(value: datetime) -> datetime:
    """Normalize a datetime to naive-UTC, rounded to milliseconds, so
    comparisons are stable regardless of source. Two things differ between
    a freshly-parsed FPL timestamp and one read back from the database:
    tz-awareness (Pydantic parses FPL's "Z" suffix as UTC-aware; asyncpg
    returns timestamptz columns converted to the session's timezone as
    naive) and precision (Prisma's DateTime columns are TIMESTAMP(3) —
    Postgres rounds to milliseconds at storage time, so a full-microsecond
    Python value never matches what was actually persisted unless rounded
    the same way first)."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)

    rounded_micros = round(value.microsecond, -3)
    if rounded_micros == 1_000_000:
        return value.replace(microsecond=0) + timedelta(seconds=1)
    return value.replace(microsecond=rounded_micros)


async def _import_transfers(
    db: AsyncSession,
    fpl_team: FplTeam,
    gameweeks: dict[int, Gameweek],
    transfers: list[FplTransfer],
) -> None:
    existing = await db.execute(
        select(TransferHistory.executedAt).where(TransferHistory.fplTeamId == fpl_team.id)
    )
    already_imported = {_as_naive_utc(row[0]) for row in existing.all()}

    for transfer in transfers:
        executed_at = _as_naive_utc(transfer.time)
        if executed_at in already_imported:
            continue
        gameweek = gameweeks.get(transfer.event)
        if gameweek is None:
            continue
        db.add(
            TransferHistory(
                fplTeamId=fpl_team.id,
                gameweekId=gameweek.id,
                playerOutId=transfer.element_out,
                playerInId=transfer.element_in,
                # FPL only reports the transfer-cost hit per gameweek, not
                # per individual transfer — precise attribution is a
                # transfer-planner (build step 3) concern.
                transferCost=0,
                executedAt=executed_at,
            )
        )
    await db.flush()


async def _import_chip_usage(
    db: AsyncSession,
    fpl_team: FplTeam,
    gameweeks: dict[int, Gameweek],
    chips: list[FplChipUsage],
) -> None:
    """Which chip (if any) the manager actually played in each past
    gameweek — needed to get the free-transfer rollover right, since a
    Wildcard/Free Hit gameweek doesn't consume or roll the saved free
    transfer the way a normal gameweek does (see available_free_transfers)."""
    rows = [
        {
            "fplTeamId": fpl_team.id,
            "gameweekId": gameweeks[chip.event].id,
            "chip": CHIP_NAME_MAP.get(chip.name, chip.name),
        }
        for chip in chips
        if chip.event in gameweeks
    ]
    if not rows:
        return
    stmt = pg_insert(ChipUsage).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[ChipUsage.fplTeamId, ChipUsage.gameweekId],
        set_={"chip": stmt.excluded.chip},
    )
    await db.execute(stmt)
    await db.flush()


async def _upsert_fixtures(
    db: AsyncSession, gameweeks: dict[int, Gameweek], fixtures: list[FplFixture]
) -> None:
    """The season's full fixture list — shared reference data, not
    per-team, refreshed on every import the same way clubs/players are.
    Used to show each squad player's opponent for the gameweek being
    viewed (see squad.py's opponent lookup) instead of just their own
    club."""
    rows = [
        {
            "id": f.id,
            "gameweekId": gameweeks[f.event].id,
            "homeTeamId": f.team_h,
            "awayTeamId": f.team_a,
            "finished": f.finished,
        }
        for f in fixtures
        if f.event is not None and f.event in gameweeks
    ]
    if not rows:
        return
    stmt = pg_insert(Fixture).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Fixture.id],
        set_={
            "gameweekId": stmt.excluded.gameweekId,
            "homeTeamId": stmt.excluded.homeTeamId,
            "awayTeamId": stmt.excluded.awayTeamId,
            "finished": stmt.excluded.finished,
        },
    )
    await db.execute(stmt)
    await db.flush()


async def _upsert_current_gameweek_points(db: AsyncSession, live: FplLiveResponse) -> None:
    """Every player's actual points for whatever gameweek is current —
    refreshed wholesale on every import, the same snapshot-not-history
    treatment as currentPrice. Used to show a squad player's real return
    once their fixture has finished instead of who they're playing (see
    squad.py's build_player_rows).

    A plain bulk UPDATE, not an upsert: every id here already exists as a
    Player row from _upsert_clubs_and_players just above, sourced from the
    same bootstrap response. An INSERT ... ON CONFLICT DO UPDATE was tried
    first and rejected — confirmed against a live Postgres, ON CONFLICT DO
    UPDATE still validates NOT NULL on every column of the *candidate* row
    before the conflict redirects to UPDATE, so omitting clubId/webName/etc
    (which this partial upsert has no data for) fails even though those
    columns are never actually written."""
    rows = [{"_id": e.id, "_points": e.stats.total_points} for e in live.elements]
    if not rows:
        return
    # Core Table.update(), not the ORM-mapped update(Player): the latter
    # auto-detects this shape as its "bulk UPDATE by primary key" feature,
    # which requires the parameter dict's key to literally be "id" — using
    # the raw table sidesteps that ORM heuristic entirely.
    stmt = (
        Player.__table__.update()
        .where(Player.id == bindparam("_id"))
        .values(currentGameweekPoints=bindparam("_points"))
    )
    await db.execute(stmt, rows)
    await db.flush()


async def import_team(db: AsyncSession, user_id: str, fpl_team_id: int) -> FplTeam:
    async with FplClient() as client:
        entry = await client.get_entry(fpl_team_id)
        bootstrap = await client.get_bootstrap_static()

        current_event_id = next(
            (e.id for e in bootstrap.events if e.is_current), entry.current_event
        )
        if current_event_id is None:
            raise FplTeamNotFoundError(fpl_team_id)

        picks = await client.get_entry_picks(fpl_team_id, current_event_id)
        transfers = await client.get_entry_transfers(fpl_team_id)
        history = await client.get_entry_history(fpl_team_id)
        fixtures = await client.get_fixtures()
        live = await client.get_event_live(current_event_id)

    season = await _upsert_season(db, bootstrap)
    await _upsert_chip_windows(db, season, bootstrap)
    gameweeks = await _upsert_gameweeks(db, season, bootstrap)
    await _upsert_clubs_and_players(db, bootstrap)
    await _upsert_fixtures(db, gameweeks, fixtures)
    await _upsert_current_gameweek_points(db, live)

    fpl_team = await _upsert_fpl_team(db, user_id, fpl_team_id, entry)
    await _replace_snapshot(db, fpl_team, gameweeks[current_event_id], picks)
    await _import_transfers(db, fpl_team, gameweeks, transfers)
    await _import_chip_usage(db, fpl_team, gameweeks, history.chips)

    await db.commit()
    return fpl_team
