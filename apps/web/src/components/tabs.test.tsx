import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setNavigationGuard } from "@/lib/navigation-guard";
import { Tabs } from "./tabs";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/planner",
  useRouter: () => ({ push }),
}));

describe("Tabs", () => {
  afterEach(() => {
    setNavigationGuard(null);
    push.mockClear();
  });

  it("marks the current tab", () => {
    render(<Tabs />);
    expect(screen.getByRole("link", { name: "Planner" })).toHaveAttribute("aria-current", "page");
  });

  it("asks the unsaved-changes guard before leaving, and holds the navigation", async () => {
    const user = userEvent.setup();
    const guard = jest.fn(() => true);
    setNavigationGuard(guard);
    render(<Tabs />);

    await user.click(screen.getByRole("link", { name: "Squad" }));

    expect(guard).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates through the router once the guard lets it proceed", async () => {
    const user = userEvent.setup();
    setNavigationGuard((proceed) => {
      proceed();
      return true;
    });
    render(<Tabs />);

    await user.click(screen.getByRole("link", { name: "Squad" }));

    expect(push).toHaveBeenCalledWith("/dashboard");
  });
});
