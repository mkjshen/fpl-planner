import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def cuid() -> str:
    return uuid.uuid4().hex


class Position(str, enum.Enum):
    GK = "GK"
    DEF = "DEF"
    MID = "MID"
    FWD = "FWD"


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)


class FplTeam(Base):
    __tablename__ = "FplTeam"
    __table_args__ = (UniqueConstraint("userId", "fplTeamId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"))
    fplTeamId: Mapped[int] = mapped_column(Integer)
    teamName: Mapped[str | None] = mapped_column(String)
    managerName: Mapped[str | None] = mapped_column(String)
    linkedAt: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)

    snapshots: Mapped[list["SquadSnapshot"]] = relationship(back_populates="fplTeam")
    transfers: Mapped[list["TransferHistory"]] = relationship(back_populates="fplTeam")


class Season(Base):
    __tablename__ = "Season"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    label: Mapped[str] = mapped_column(String, unique=True)
    isCurrent: Mapped[bool] = mapped_column(Boolean, default=False)
    freeTransferCap: Mapped[int] = mapped_column(Integer)
    freeTransferRolloverLimit: Mapped[int] = mapped_column(Integer)
    chipsAvailable: Mapped[list[str]] = mapped_column(ARRAY(String))

    gameweeks: Mapped[list["Gameweek"]] = relationship(back_populates="season")


class ChipWindow(Base):
    __tablename__ = "ChipWindow"
    __table_args__ = (UniqueConstraint("seasonId", "chip", "startEvent"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    seasonId: Mapped[str] = mapped_column(String, ForeignKey("Season.id", ondelete="CASCADE"))
    chip: Mapped[str] = mapped_column(String)
    startEvent: Mapped[int] = mapped_column(Integer)
    stopEvent: Mapped[int] = mapped_column(Integer)


class Gameweek(Base):
    __tablename__ = "Gameweek"
    __table_args__ = (UniqueConstraint("seasonId", "number"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    seasonId: Mapped[str] = mapped_column(String, ForeignKey("Season.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    deadlineTime: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    isCurrent: Mapped[bool] = mapped_column(Boolean, default=False)
    isNext: Mapped[bool] = mapped_column(Boolean, default=False)
    isFinished: Mapped[bool] = mapped_column(Boolean, default=False)

    season: Mapped["Season"] = relationship(back_populates="gameweeks")


class Club(Base):
    __tablename__ = "Club"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[int | None] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String)
    shortName: Mapped[str] = mapped_column(String)


class Player(Base):
    __tablename__ = "Player"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clubId: Mapped[int] = mapped_column(Integer, ForeignKey("Club.id"))
    webName: Mapped[str] = mapped_column(String)
    fullName: Mapped[str] = mapped_column(String)
    position: Mapped[Position] = mapped_column(PGEnum(Position, name="Position", create_type=False))
    currentPrice: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default="available")

    photoCode: Mapped[int | None] = mapped_column(Integer, nullable=True)
    form: Mapped[float] = mapped_column(Float, default=0)
    totalPoints: Mapped[int] = mapped_column(Integer, default=0)
    pointsPerGame: Mapped[float] = mapped_column(Float, default=0)
    selectedByPercent: Mapped[float] = mapped_column(Float, default=0)
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    goalsScored: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    cleanSheets: Mapped[int] = mapped_column(Integer, default=0)
    bonus: Mapped[int] = mapped_column(Integer, default=0)
    ictIndex: Mapped[float] = mapped_column(Float, default=0)
    expectedGoals: Mapped[float] = mapped_column(Float, default=0)
    expectedAssists: Mapped[float] = mapped_column(Float, default=0)
    valueSeason: Mapped[float] = mapped_column(Float, default=0)
    chanceOfPlayingNextRound: Mapped[int | None] = mapped_column(Integer, nullable=True)
    news: Mapped[str] = mapped_column(String, default="")
    currentGameweekPoints: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Fixture(Base):
    __tablename__ = "Fixture"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gameweekId: Mapped[str] = mapped_column(String, ForeignKey("Gameweek.id", ondelete="CASCADE"))
    homeTeamId: Mapped[int] = mapped_column(Integer, ForeignKey("Club.id"))
    awayTeamId: Mapped[int] = mapped_column(Integer, ForeignKey("Club.id"))
    finished: Mapped[bool] = mapped_column(Boolean, default=False)


class PlayerPriceHistory(Base):
    __tablename__ = "PlayerPriceHistory"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    playerId: Mapped[int] = mapped_column(Integer, ForeignKey("Player.id", ondelete="CASCADE"))
    price: Mapped[int] = mapped_column(Integer)
    recordedAt: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)


class SquadSnapshot(Base):
    __tablename__ = "SquadSnapshot"
    __table_args__ = (UniqueConstraint("fplTeamId", "gameweekId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    fplTeamId: Mapped[str] = mapped_column(String, ForeignKey("FplTeam.id", ondelete="CASCADE"))
    gameweekId: Mapped[str] = mapped_column(String, ForeignKey("Gameweek.id"))
    bank: Mapped[int] = mapped_column(Integer)
    teamValue: Mapped[int] = mapped_column(Integer)
    capturedAt: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)

    fplTeam: Mapped["FplTeam"] = relationship(back_populates="snapshots")
    players: Mapped[list["SquadPlayer"]] = relationship(back_populates="snapshot")


class SquadPlayer(Base):
    __tablename__ = "SquadPlayer"
    __table_args__ = (UniqueConstraint("snapshotId", "playerId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    snapshotId: Mapped[str] = mapped_column(String, ForeignKey("SquadSnapshot.id", ondelete="CASCADE"))
    playerId: Mapped[int] = mapped_column(Integer, ForeignKey("Player.id"))
    purchasePrice: Mapped[int] = mapped_column(Integer)
    sellingPrice: Mapped[int] = mapped_column(Integer)
    isStarting: Mapped[bool] = mapped_column(Boolean, default=False)
    squadPosition: Mapped[int] = mapped_column(Integer)
    isCaptain: Mapped[bool] = mapped_column(Boolean, default=False)
    isViceCaptain: Mapped[bool] = mapped_column(Boolean, default=False)

    snapshot: Mapped["SquadSnapshot"] = relationship(back_populates="players")
    player: Mapped["Player"] = relationship()


class TransferHistory(Base):
    __tablename__ = "TransferHistory"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    fplTeamId: Mapped[str] = mapped_column(String, ForeignKey("FplTeam.id", ondelete="CASCADE"))
    gameweekId: Mapped[str] = mapped_column(String, ForeignKey("Gameweek.id"))
    playerOutId: Mapped[int] = mapped_column(Integer, ForeignKey("Player.id"))
    playerInId: Mapped[int] = mapped_column(Integer, ForeignKey("Player.id"))
    transferCost: Mapped[int] = mapped_column(Integer)
    executedAt: Mapped[datetime] = mapped_column(DateTime(timezone=False))

    fplTeam: Mapped["FplTeam"] = relationship(back_populates="transfers")


class ChipUsage(Base):
    __tablename__ = "ChipUsage"
    __table_args__ = (UniqueConstraint("fplTeamId", "gameweekId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    fplTeamId: Mapped[str] = mapped_column(String, ForeignKey("FplTeam.id", ondelete="CASCADE"))
    gameweekId: Mapped[str] = mapped_column(String, ForeignKey("Gameweek.id"))
    chip: Mapped[str] = mapped_column(String)


class LineupPlan(Base):
    __tablename__ = "LineupPlan"
    __table_args__ = (UniqueConstraint("fplTeamId", "gameweekId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    fplTeamId: Mapped[str] = mapped_column(String, ForeignKey("FplTeam.id", ondelete="CASCADE"))
    gameweekId: Mapped[str] = mapped_column(String, ForeignKey("Gameweek.id"))
    transfersMade: Mapped[int] = mapped_column(Integer, default=0)
    transferCost: Mapped[int] = mapped_column(Integer, default=0)
    chipUsed: Mapped[str | None] = mapped_column(String, nullable=True)
    bank: Mapped[int] = mapped_column(Integer, default=0)
    teamValue: Mapped[int] = mapped_column(Integer, default=0)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    players: Mapped[list["LineupPlanPlayer"]] = relationship(back_populates="plan")


class LineupPlanPlayer(Base):
    __tablename__ = "LineupPlanPlayer"
    __table_args__ = (UniqueConstraint("planId", "playerId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=cuid)
    planId: Mapped[str] = mapped_column(String, ForeignKey("LineupPlan.id", ondelete="CASCADE"))
    playerId: Mapped[int] = mapped_column(Integer, ForeignKey("Player.id"))
    isStarting: Mapped[bool] = mapped_column(Boolean, default=False)
    squadPosition: Mapped[int] = mapped_column(Integer)
    isCaptain: Mapped[bool] = mapped_column(Boolean, default=False)
    isViceCaptain: Mapped[bool] = mapped_column(Boolean, default=False)
    purchasePrice: Mapped[int] = mapped_column(Integer, default=0)
    sellingPrice: Mapped[int] = mapped_column(Integer, default=0)

    plan: Mapped["LineupPlan"] = relationship(back_populates="players")
    player: Mapped["Player"] = relationship()
