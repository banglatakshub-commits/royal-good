import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";

/**
 * Renders the real /withdraw page with its server calls mocked, so form behaviour is covered too:
 * inline field errors, the minimum-withdraw rule, the main-balance message and the activation popup
 * that is shown only after a valid form submission for an inactive account.
 */
const h = vi.hoisted(() => {
  const state = {
    balance: 500,
    page: null as null | ComponentType,
    history: {
      rows: [] as unknown[],
      rejectedCount: 0,
      isActive: true,
      isBlocked: false,
      activationFee: 100,
      balance: 500,
      minWithdraw: 50,
      minimum: 50,
    },
    result: {
      ok: true,
      error: null as string | null,
      code: null as string | null,
      balance: 400,
      minimum: 50,
      isActive: true,
    },
  };
  return {
    state,
    /** Keep the wallet cache and the server snapshot in step, exactly like the real page does. */
    setBalance(balance: number) {
      state.balance = balance;
      state.history.balance = balance;
    },
    getMyWithdrawalHistory: vi.fn(async (..._args: unknown[]) => state.history),
    requestWithdraw: vi.fn(async (..._args: unknown[]) => state.result),
    generatePaymentUrl: vi.fn(async (..._args: unknown[]) => ({
      ok: false,
      error: "পেমেন্ট লিংক নেই",
    })),
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // Capture the page component instead of booting a router: the real root renders <html>.
    createFileRoute: () => (options: { component: ComponentType }) => {
      h.state.page = options.component;
      return {};
    },
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/components/AppShell", () => ({
  PageShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => null }));

vi.mock("@/lib/wallet", () => ({
  useBalance: () => h.state.balance,
  getBalance: () => h.state.balance,
  setServerBalance: (next: number) => {
    h.state.balance = next;
  },
  refreshBalance: async () => {},
}));

vi.mock("@/lib/settings", () => ({
  settings: { min_withdraw: 50 },
  loadSettings: async () => ({ min_withdraw: 50 }),
}));

vi.mock("@/lib/telegram", () => ({
  getTgIdentity: () => ({ initData: "", tgId: "42", name: "Tester", username: "tester" }),
}));

vi.mock("@/lib/earn.functions", () => ({
  getMyWithdrawalHistory: h.getMyWithdrawalHistory,
  requestWithdraw: h.requestWithdraw,
  generatePaymentUrl: h.generatePaymentUrl,
}));

async function renderPage() {
  await import("@/routes/withdraw");
  const Page = h.state.page;
  if (!Page) throw new Error("The withdraw route did not register its component");
  render(<Page />);
  // Wait out the initial load: the submit button is disabled and labelled "লোড হচ্ছে..." until the
  // server-side withdrawal state (balance, minimum, activation) has arrived.
  return waitFor(() => {
    const submit = document.getElementById("withdraw-submit");
    if (!submit || submit.textContent === "লোড হচ্ছে...") throw new Error("still loading");
    return submit;
  });
}

function fill(fields: { amount?: string; number?: string }) {
  if (fields.number !== undefined) {
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), { target: { value: fields.number } });
  }
  if (fields.amount !== undefined) {
    fireEvent.change(screen.getByLabelText("পরিমাণ (৳)"), { target: { value: fields.amount } });
  }
}

/** Inline error slot under a field; `null` while that field is valid. */
function fieldError(id: "withdraw-amount-error" | "withdraw-number-error") {
  return document.getElementById(id)?.textContent ?? null;
}

beforeEach(() => {
  localStorage.clear();
  h.getMyWithdrawalHistory.mockClear();
  h.requestWithdraw.mockClear();
  h.generatePaymentUrl.mockClear();
  h.state.history = {
    rows: [],
    rejectedCount: 0,
    isActive: true,
    isBlocked: false,
    activationFee: 100,
    balance: 500,
    minWithdraw: 50,
    minimum: 50,
  };
  h.state.result = { ok: true, error: null, code: null, balance: 400, minimum: 50, isActive: true };
  h.setBalance(500);
});

describe("withdraw page validation", () => {
  it("blocks an empty form, names every missing field and never calls the server", async () => {
    const submit = await renderPage();
    fireEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("বিকাশ/নগদ মোবাইল নম্বর লিখুন");
    expect(fieldError("withdraw-number-error")).toBe("বিকাশ/নগদ মোবাইল নম্বর লিখুন");
    expect(fieldError("withdraw-amount-error")).toBe("উইথড্রের পরিমাণ লিখুন");
    expect(h.requestWithdraw).not.toHaveBeenCalled();
  });

  it("rejects an amount under the minimum withdraw and says what the minimum is", async () => {
    const submit = await renderPage();
    fill({ amount: "20", number: "01712345678" });
    fireEvent.click(submit);

    await waitFor(() => expect(fieldError("withdraw-amount-error")).toContain("৳50"));
    expect(fieldError("withdraw-amount-error")).toContain("সর্বনিম্ন উইথড্র");
    expect(screen.getByRole("alert")).toHaveTextContent("সর্বনিম্ন উইথড্র ৳50");
    expect(h.requestWithdraw).not.toHaveBeenCalled();
  });

  it("rejects a malformed mobile number and keeps a well-formed foreign prefix", async () => {
    const submit = await renderPage();
    fill({ amount: "100", number: "01212345678" });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(fieldError("withdraw-number-error")).toBe(
        "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (যেমন 01712345678)",
      ),
    );
    expect(h.requestWithdraw).not.toHaveBeenCalled();

    fill({ number: "0171234567" });
    expect(fieldError("withdraw-number-error")).toContain("সঠিক ১১ সংখ্যার");
  });

  it("warns that the main balance is below the configured minimum", async () => {
    h.setBalance(30);
    const submit = await renderPage();

    expect(
      await screen.findByText(
        /আপনার মেইন ব্যালেন্স ৳30, কিন্তু সর্বনিম্ন উইথড্র ৳50 — আরও ৳20 জমা হলে উইথড্র করতে পারবেন।/,
      ),
    ).toBeInTheDocument();
    expect(submit).toHaveTextContent("উইথড্র করতে কমপক্ষে ৳50 লাগবে");

    fill({ amount: "30", number: "01712345678" });
    fireEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("সর্বনিম্ন উইথড্র ৳50");
    expect(h.requestWithdraw).not.toHaveBeenCalled();
  });

  it("reports how much more this request needs when the balance covers the minimum only partly", async () => {
    h.setBalance(120);
    const submit = await renderPage();
    fill({ amount: "200", number: "01712345678" });
    fireEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "পর্যাপ্ত ব্যালেন্স নেই। আপনার মেইন ব্যালেন্স ৳120, এই উইথড্রে আরও ৳80 প্রয়োজন।",
    );
    expect(h.requestWithdraw).not.toHaveBeenCalled();
  });

  it("sends a valid request with the normalized number and shows the success screen", async () => {
    const submit = await renderPage();
    fill({ amount: "100", number: "+8801712345678" });
    fireEvent.click(submit);

    await waitFor(() => expect(h.requestWithdraw).toHaveBeenCalledTimes(1));
    expect(h.requestWithdraw.mock.calls[0]?.[0]).toMatchObject({
      data: { amount: 100, method: "bKash", number: "01712345678" },
    });
    expect(await screen.findByText("রিকোয়েস্ট সফল!")).toBeInTheDocument();
  });

  it("surfaces the server's own refusal and corrects the cached balance", async () => {
    h.state.result = {
      ok: false,
      error: "পর্যাপ্ত ব্যালেন্স নেই",
      code: "balance_insufficient",
      balance: 10,
      minimum: 50,
      isActive: true,
    };
    const submit = await renderPage();
    fill({ amount: "100", number: "01712345678" });
    fireEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("পর্যাপ্ত ব্যালেন্স নেই");
    await waitFor(() => expect(h.state.balance).toBe(10));
  });

  it("opens the activation popup for an authoritative inactive-account refusal", async () => {
    h.state.result = {
      ok: false,
      error: "অ্যাকাউন্ট অ্যাক্টিভ নয়",
      code: "account_inactive",
      balance: 500,
      minimum: 50,
      isActive: false,
    };
    const submit = await renderPage();
    fill({ amount: "100", number: "01712345678" });
    fireEvent.click(submit);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(h.requestWithdraw).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "ফিরে যান" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body).not.toHaveTextContent("অ্যাক্টিভ");
  });

  it("only shows the activation popup after an inactive account submits a valid form", async () => {
    h.state.history = { ...h.state.history, isActive: false, activationFee: 100 };
    const submit = await renderPage();

    expect(document.body).not.toHaveTextContent("অ্যাক্টিভ");
    expect(submit).toHaveTextContent("উইথড্র করুন");

    fireEvent.click(submit);
    await waitFor(() => expect(fieldError("withdraw-amount-error")).toBe("উইথড্রের পরিমাণ লিখুন"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("অ্যাক্টিভ");

    fill({ amount: "20", number: "01712345678" });
    fireEvent.click(submit);
    await waitFor(() => expect(fieldError("withdraw-amount-error")).toContain("৳50"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("অ্যাক্টিভ");

    fill({ amount: "100" });
    fireEvent.click(submit);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "অ্যাকাউন্ট অ্যাক্টিভ নয়" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "বিকাশ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "নগদ" })).toBeInTheDocument();
    expect(h.requestWithdraw).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ফিরে যান" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByLabelText("মোবাইল নম্বর")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("অ্যাক্টিভ");
  });

  it("still validates the inputs first when the account is inactive", async () => {
    h.state.history = { ...h.state.history, isActive: false };
    const submit = await renderPage();
    fireEvent.click(submit);

    await waitFor(() => expect(fieldError("withdraw-amount-error")).toBe("উইথড্রের পরিমাণ লিখুন"));
    expect(
      screen.queryByRole("heading", { name: "অ্যাকাউন্ট অ্যাক্টিভ নয়" }),
    ).not.toBeInTheDocument();
    expect(h.requestWithdraw).not.toHaveBeenCalled();
  });

  it("applies the escalated minimum of a user whose withdrawals were rejected", async () => {
    h.state.history = { ...h.state.history, rejectedCount: 1, minimum: 100 };
    const submit = await renderPage();

    expect(await screen.findByText(/সর্বনিম্ন সীমা 2 গুণ বেড়েছে/)).toBeInTheDocument();

    fill({ amount: "60", number: "01712345678" });
    fireEvent.click(submit);

    await waitFor(() => expect(fieldError("withdraw-amount-error")).toContain("৳100"));
    expect(h.requestWithdraw).not.toHaveBeenCalled();
  });

  it("blocks a blocked account before any request is attempted", async () => {
    h.state.history = { ...h.state.history, isBlocked: true };
    const submit = await renderPage();

    expect(await screen.findByText(/আপনার অ্যাকাউন্ট ব্লক করা হয়েছে/)).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fill({ amount: "100", number: "01712345678" });
    fireEvent.click(submit);
    expect(h.requestWithdraw).not.toHaveBeenCalled();
  });
});
