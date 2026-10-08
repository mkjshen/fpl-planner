import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RovingGroup } from "./roving-group";

function Squad() {
  return (
    <>
      <button>Before</button>
      <RovingGroup label="Your squad">
        {["Raya", "Saka", "Haaland"].map((name, i) => (
          <button key={name} data-roving-item data-roving-id={i}>
            {name}
          </button>
        ))}
      </RovingGroup>
      <button>After</button>
    </>
  );
}

describe("RovingGroup", () => {
  it("makes the whole group a single Tab stop", async () => {
    const user = userEvent.setup();
    render(<Squad />);
    screen.getByRole("button", { name: "Before" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Raya" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("returns Tab to the player that last had focus", async () => {
    const user = userEvent.setup();
    render(<Squad />);
    screen.getByRole("button", { name: "Haaland" }).focus();
    await user.tab(); // out to After
    await user.tab({ shift: true }); // back into the group
    expect(screen.getByRole("button", { name: "Haaland" })).toHaveFocus();
  });

  it("jumps to the first and last player with Home and End", async () => {
    const user = userEvent.setup();
    render(<Squad />);
    screen.getByRole("button", { name: "Saka" }).focus();
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: "Haaland" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "Raya" })).toHaveFocus();
  });

  it("exposes the group with its label", () => {
    render(<Squad />);
    expect(screen.getByRole("group", { name: "Your squad" })).toBeInTheDocument();
  });
});
