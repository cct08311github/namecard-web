import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TemperatureMixStrip } from "../TemperatureMixStrip";

describe("TemperatureMixStrip", () => {
  it("renders nothing when all counts are 0", () => {
    const { container } = render(
      <TemperatureMixStrip counts={{ hot: 0, warm: 0, active: 0, quiet: 0, cold: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only levels with count > 0, in canonical order", () => {
    const { container } = render(
      <TemperatureMixStrip counts={{ hot: 2, warm: 0, active: 1, quiet: 0, cold: 3 }} />,
    );
    const text = container.textContent ?? "";
    // canonical order: hot → warm → active → quiet → cold
    const hotIdx = text.indexOf("🔥 2");
    const activeIdx = text.indexOf("💫 1");
    const coldIdx = text.indexOf("💤 3");
    expect(hotIdx).toBeGreaterThanOrEqual(0);
    expect(activeIdx).toBeGreaterThan(hotIdx);
    expect(coldIdx).toBeGreaterThan(activeIdx);
    // skipped levels are absent
    expect(text).not.toContain("✨"); // warm = 0
    expect(text).not.toContain("🌙"); // quiet = 0
  });

  it("aria-label is descriptive for screen readers", () => {
    render(<TemperatureMixStrip counts={{ hot: 1, warm: 0, active: 0, quiet: 0, cold: 0 }} />);
    expect(screen.getByLabelText(/Temperature distribution/i)).toBeInTheDocument();
  });
});
