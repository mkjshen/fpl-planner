import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Dialog } from "./dialog";

function Harness({ canClose = true }: { canClose?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Dialog label="Example" onClose={() => setOpen(false)} canClose={canClose}>
          <button>First</button>
          <button data-autofocus>Safe choice</button>
          <button>Last</button>
        </Dialog>
      )}
    </>
  );
}

describe("Dialog", () => {
  it("moves focus to the data-autofocus control when opened", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Safe choice" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("ignores Escape while it can't be closed", async () => {
    const user = userEvent.setup();
    render(<Harness canClose={false} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Example" })).toBeInTheDocument();
  });

  it("keeps Tab inside the dialog, wrapping at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.tab(); // Safe choice -> Last
    await user.tab(); // Last -> wraps to First
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab({ shift: true }); // First -> wraps to Last
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("lets only the innermost of two nested dialogs answer Escape", async () => {
    const user = userEvent.setup();
    const outerClose = jest.fn();
    function Nested() {
      const [innerOpen, setInnerOpen] = useState(true);
      return (
        <Dialog label="Outer" onClose={outerClose}>
          <button>Outer control</button>
          {innerOpen && (
            <Dialog label="Inner" onClose={() => setInnerOpen(false)}>
              <button>Inner control</button>
            </Dialog>
          )}
        </Dialog>
      );
    }
    render(<Nested />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Inner" })).not.toBeInTheDocument();
    expect(outerClose).not.toHaveBeenCalled();
  });

  it("restores page scroll after nested dialogs that opened together both close", () => {
    function Pair() {
      return (
        <Dialog label="Outer" onClose={() => {}}>
          <Dialog label="Inner" onClose={() => {}}>
            <button>Inner control</button>
          </Dialog>
        </Dialog>
      );
    }
    const { unmount } = render(<Pair />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("locks page scroll while open and restores it on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });
});
