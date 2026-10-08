import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SquadPlayer } from "@/lib/api";
import { PlayerCard, playerCardLabel } from "./pitch";

function makePlayer(overrides: Partial<SquadPlayer> = {}): SquadPlayer {
  return {
    playerId: 1,
    webName: "Saka",
    position: "MID",
    club: "ARS",
    clubCode: 3,
    opponent: "LEE (H)",
    currentPrice: 96,
    purchasePrice: 96,
    sellingPrice: 96,
    isStarting: true,
    squadPosition: 7,
    isCaptain: false,
    isViceCaptain: false,
    ...overrides,
  };
}

describe("playerCardLabel", () => {
  it("speaks everything the card shows", () => {
    expect(playerCardLabel(makePlayer({ isCaptain: true }))).toBe(
      "Saka, midfielder, £9.6m, next fixture LEE (H), captain",
    );
  });

  it("uses finished-fixture points instead of the opponent", () => {
    expect(playerCardLabel(makePlayer({ actualPoints: 1, opponent: undefined }))).toBe(
      "Saka, midfielder, £9.6m, 1 point this gameweek",
    );
  });

  it("includes the bench slot when given", () => {
    expect(playerCardLabel(makePlayer({ isStarting: false }), { benchSlot: "substitute 1" })).toBe(
      "Saka, midfielder, £9.6m, substitute 1, next fixture LEE (H)",
    );
  });

  it("includes the substitution state", () => {
    expect(playerCardLabel(makePlayer(), { selected: true })).toContain("selected to substitute");
    expect(playerCardLabel(makePlayer(), { disabled: true })).toContain("can't swap with the selected player");
  });
});

describe("PlayerCard", () => {
  it("joins a roving group and drops its × from the Tab order", () => {
    render(<PlayerCard player={makePlayer()} onClick={() => {}} onRemove={() => {}} roving />);
    expect(screen.getByRole("button", { name: /^Saka, midfielder/ })).toHaveAttribute("data-roving-item");
    expect(screen.getByRole("button", { name: "Transfer out Saka" })).toHaveAttribute("tabindex", "-1");
  });

  it("keeps every name on one line, with the full name in its title", () => {
    for (const webName of ["Donnarumma", "Gibbs-White"]) {
      const { unmount } = render(<PlayerCard player={makePlayer({ webName })} muted />);
      const name = screen.getByText(webName);
      expect(name).toHaveClass("truncate");
      expect(name).not.toHaveClass("line-clamp-2");
      expect(name).toHaveAttribute("title", webName);
      unmount();
    }
  });

  it("hides the transfer-out × on touch screens, where tapping the card opens the action sheet", () => {
    render(<PlayerCard player={makePlayer()} onClick={() => {}} onRemove={() => {}} />);
    expect(screen.getByRole("button", { name: "Transfer out Saka" })).toHaveClass("pointer-coarse:hidden");
  });

  it("is a keyboard-operable button when it has an action", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<PlayerCard player={makePlayer()} onClick={onClick} />);

    const card = screen.getByRole("button", { name: /^Saka, midfielder/ });
    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("stays focusable but inert while it can't be swapped", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<PlayerCard player={makePlayer()} onClick={onClick} disabled />);

    const card = screen.getByRole("button", { name: /can't swap/ });
    expect(card).toHaveAttribute("aria-disabled", "true");
    await user.click(card);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the remove button separate from the card button", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const onRemove = jest.fn();
    render(<PlayerCard player={makePlayer()} onClick={onClick} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Transfer out Saka" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders no button at all when display-only", () => {
    render(<PlayerCard player={makePlayer()} muted />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
