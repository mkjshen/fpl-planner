import { guardNavigation, setNavigationGuard } from "./navigation-guard";

describe("navigation guard", () => {
  afterEach(() => setNavigationGuard(null));

  it("lets navigation through when nothing is registered", () => {
    const proceed = jest.fn();
    expect(guardNavigation(proceed)).toBe(false);
    expect(proceed).not.toHaveBeenCalled();
  });

  it("hands the navigation to a registered guard, which can run it later", () => {
    let held: (() => void) | null = null;
    setNavigationGuard((proceed) => {
      held = proceed;
      return true;
    });
    const proceed = jest.fn();

    expect(guardNavigation(proceed)).toBe(true);
    expect(proceed).not.toHaveBeenCalled();
    held!();
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("stops intercepting once unregistered", () => {
    setNavigationGuard(() => true);
    setNavigationGuard(null);
    expect(guardNavigation(jest.fn())).toBe(false);
  });
});
