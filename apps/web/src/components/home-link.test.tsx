import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setNavigationGuard } from "@/lib/navigation-guard";
import { HomeLink } from "./home-link";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("HomeLink", () => {
  afterEach(() => {
    setNavigationGuard(null);
    push.mockClear();
  });

  it("links to the planner", () => {
    render(<HomeLink />);
    expect(screen.getByRole("link", { name: "FPL Team Planner" })).toHaveAttribute("href", "/dashboard/planner");
  });

  it("asks the unsaved-changes guard before leaving, and holds the navigation", async () => {
    const user = userEvent.setup();
    const guard = jest.fn(() => true);
    setNavigationGuard(guard);
    render(<HomeLink />);

    await user.click(screen.getByRole("link", { name: "FPL Team Planner" }));

    expect(guard).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates through the router once the guard lets it proceed", async () => {
    const user = userEvent.setup();
    setNavigationGuard((proceed) => {
      proceed();
      return true;
    });
    render(<HomeLink />);

    await user.click(screen.getByRole("link", { name: "FPL Team Planner" }));

    expect(push).toHaveBeenCalledWith("/dashboard/planner");
  });
});
