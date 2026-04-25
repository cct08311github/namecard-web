import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { VoiceMicButton } from "../VoiceMicButton";

interface FakeRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: unknown; resultIndex: number }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
  __started: boolean;
  __stopped: boolean;
}

function makeFakeRecognition(): FakeRecognition {
  const fake: FakeRecognition = {
    continuous: false,
    interimResults: false,
    lang: "",
    onresult: null,
    onerror: null,
    onend: null,
    __started: false,
    __stopped: false,
    start: () => {
      fake.__started = true;
    },
    stop: () => {
      fake.__stopped = true;
    },
    abort: () => {
      fake.__stopped = true;
    },
  };
  return fake;
}

describe("VoiceMicButton", () => {
  let originalSpeechRecognition: unknown;
  let lastFake: FakeRecognition | null = null;

  beforeEach(() => {
    lastFake = null;
    originalSpeechRecognition = (window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
    (window as unknown as { webkitSpeechRecognition: () => unknown }).webkitSpeechRecognition =
      function () {
        const f = makeFakeRecognition();
        lastFake = f;
        return f;
      } as unknown as () => unknown;
  });

  afterEach(() => {
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      originalSpeechRecognition;
  });

  it("renders the start button when Web Speech is supported", () => {
    render(<VoiceMicButton onFinalTranscript={() => {}} />);
    expect(screen.getByRole("button", { name: /開始語音輸入/ })).toBeInTheDocument();
  });

  it("clicking start enters listening state and starts the recognizer", () => {
    render(<VoiceMicButton onFinalTranscript={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /開始語音輸入/ }));
    expect(screen.getByRole("button", { name: /停止語音輸入/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(lastFake?.__started).toBe(true);
    expect(lastFake?.lang).toBe("zh-TW");
  });

  it("clicking stop exits listening and stops the recognizer", () => {
    render(<VoiceMicButton onFinalTranscript={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /開始語音輸入/ }));
    fireEvent.click(screen.getByRole("button", { name: /停止語音輸入/ }));
    expect(screen.getByRole("button", { name: /開始語音輸入/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(lastFake?.__stopped).toBe(true);
  });

  it("emits final transcript via callback on result event", () => {
    const onFinal = vi.fn();
    render(<VoiceMicButton onFinalTranscript={onFinal} />);
    fireEvent.click(screen.getByRole("button", { name: /開始語音輸入/ }));
    lastFake?.onresult?.({
      results: {
        length: 1,
        0: {
          length: 1,
          isFinal: true,
          0: { transcript: "  陳玉涵 PM 智威  " },
        },
      } as unknown as { length: 1; [k: number]: { isFinal: boolean; length: number } },
      resultIndex: 0,
    });
    expect(onFinal).toHaveBeenCalledWith("陳玉涵 PM 智威");
  });

  it("emits interim transcript when result is non-final", () => {
    const onFinal = vi.fn();
    const onInterim = vi.fn();
    render(<VoiceMicButton onFinalTranscript={onFinal} onInterimTranscript={onInterim} />);
    fireEvent.click(screen.getByRole("button", { name: /開始語音輸入/ }));
    lastFake?.onresult?.({
      results: {
        length: 1,
        0: { length: 1, isFinal: false, 0: { transcript: "陳玉" } },
      } as unknown as { length: 1; [k: number]: { isFinal: boolean; length: number } },
      resultIndex: 0,
    });
    expect(onInterim).toHaveBeenCalledWith("陳玉");
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("shows denied hint when permission error fires", () => {
    render(<VoiceMicButton onFinalTranscript={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /開始語音輸入/ }));
    act(() => {
      lastFake?.onerror?.({ error: "not-allowed" });
    });
    expect(screen.getByText(/已拒絕麥克風權限/)).toBeInTheDocument();
  });

  it("disables button when disabled prop is true", () => {
    render(<VoiceMicButton onFinalTranscript={() => {}} disabled />);
    expect(screen.getByRole("button", { name: /開始語音輸入/ })).toBeDisabled();
  });

  it("renders fallback text when Web Speech is unsupported", () => {
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      undefined;
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
    render(<VoiceMicButton onFinalTranscript={() => {}} />);
    expect(screen.getByText(/不支援語音輸入/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /開始語音輸入/ })).not.toBeInTheDocument();
  });
});
