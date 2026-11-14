import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Header } from "./Header";

vi.mock("next/navigation", () => ({ usePathname: () => "/journal/" }));
afterEach(cleanup);

const header = () => document.querySelector("header") as HTMLElement;
const scrollTo = (y: number) => act(() => { window.scrollY = y; fireEvent.scroll(window); });
const mouseAt = (y: number) => act(() => { fireEvent.mouseMove(window, { clientY: y }); });

describe("Header auto-hide", () => {
  it("shows at the top, hides after scrolling down, returns when the mouse reaches the top edge", () => {
    window.scrollY = 0;
    render(<Header />);
    expect(header().dataset.hidden).toBeUndefined();

    scrollTo(600);
    expect(header().dataset.hidden).toBe("true");
    expect(header().className).toContain("-translate-y-full");

    mouseAt(400); // mouse in the page body: stays hidden
    expect(header().dataset.hidden).toBe("true");

    mouseAt(10); // mouse at the top edge: revealed
    expect(header().dataset.hidden).toBeUndefined();

    scrollTo(900); // still near the top edge while scrolling: stays revealed
    expect(header().dataset.hidden).toBeUndefined();

    mouseAt(300); // mouse leaves the top: hidden again
    expect(header().dataset.hidden).toBe("true");

    scrollTo(20); // back at the top of the page: always shown
    expect(header().dataset.hidden).toBeUndefined();
  });
});
