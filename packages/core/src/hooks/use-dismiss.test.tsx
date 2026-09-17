// @vitest-environment jsdom
/**
 * Shared by the avatar and business-selector menus. The listeners must only exist while
 * the menu is open and must be removed on unmount — a stale listener would close a menu
 * that no longer exists, or fire a callback into an unmounted component.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDismiss } from "./use-dismiss";

function Menu({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useDismiss(ref, open, onDismiss);
  return (
    <div>
      <div ref={ref} data-testid="menu">
        <button>inside</button>
      </div>
      <button data-testid="outside">outside</button>
    </div>
  );
}

afterEach(cleanup);

describe("useDismiss", () => {
  it("dismisses on a click outside the ref", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Menu open onDismiss={onDismiss} />);

    fireEvent.mouseDown(getByTestId("outside"));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not dismiss on a click inside the ref", () => {
    const onDismiss = vi.fn();
    const { getByText } = render(<Menu open onDismiss={onDismiss} />);

    fireEvent.mouseDown(getByText("inside"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(<Menu open onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("ignores other keys", () => {
    const onDismiss = vi.fn();
    render(<Menu open onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: "Tab" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does nothing at all while closed", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Menu open={false} onDismiss={onDismiss} />);

    fireEvent.mouseDown(getByTestId("outside"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("stops listening once closed", () => {
    const onDismiss = vi.fn();
    const { rerender, getByTestId } = render(<Menu open onDismiss={onDismiss} />);

    rerender(<Menu open={false} onDismiss={onDismiss} />);
    fireEvent.mouseDown(getByTestId("outside"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Menu open onDismiss={onDismiss} />);

    unmount();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
