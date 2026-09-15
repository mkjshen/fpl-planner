import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Banner } from "./feedback";

describe("Banner", () => {
  it("renders its message", () => {
    render(<Banner tone="success">Squad refreshed.</Banner>);
    expect(screen.getByText("Squad refreshed.")).toBeInTheDocument();
  });

  it("has no Dismiss button when onDismiss is omitted", () => {
    render(<Banner tone="error">Something went wrong.</Banner>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("calls onDismiss when the Dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(
      <Banner tone="info" onDismiss={onDismiss}>
        Editing this gameweek may affect later plans.
      </Banner>,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
