import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const signInWithEmailAndPassword = vi.fn();
vi.mock("../src/lib/firebase.js", () => ({ auth: {}, db: {} }));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword }));

const { default: LoginPage } = await import("../src/auth/LoginPage.jsx");
const renderPage = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);
// Firebase rejects with a real Error carrying `.code`; a bare object surfaces as an
// unhandled rejection instead of reaching the component's catch.
const authError = (code) => Object.assign(new Error(code), { code });

describe("LoginPage", () => {
  // A default implementation on every test: with the mock left un-implemented,
  // Vitest's promise tracking reports the component's handled rejection as unhandled.
  beforeEach(() => {
    signInWithEmailAndPassword.mockReset();
    signInWithEmailAndPassword.mockResolvedValue({});
  });

  it("asks for a username, never an email address", () => {
    renderPage();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/e-?mail/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/@/);
  });

  it("appends the synthetic domain before calling Firebase", async () => {
    signInWithEmailAndPassword.mockResolvedValue({});
    renderPage();
    await userEvent.type(screen.getByLabelText(/username/i), "shijin");
    await userEvent.type(screen.getByLabelText(/password/i), "Marketing-2026x");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      {}, "shijin@team.hire3x.com", "Marketing-2026x"
    );
  });

  it("rejects an invalid username before making a network call", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/username/i), "ya sh");
    await userEvent.type(screen.getByLabelText(/password/i), "Marketing-2026x");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows one plain message for wrong credentials, not a Firebase error code", async () => {
    // mockImplementation, not mockRejectedValue: the latter builds its rejected promise
    // when configured, so nothing ever consumes it and it surfaces as unhandled.
    signInWithEmailAndPassword.mockImplementation(() =>
      Promise.reject(authError("auth/invalid-credential")));
    renderPage();
    await userEvent.type(screen.getByLabelText(/username/i), "shijin");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/username or password/i);
    expect(alert.textContent).not.toMatch(/auth\//);
  });

  it("tells the user who to ask instead of offering a reset link", () => {
    renderPage();
    expect(screen.getByText(/yash or titus/i)).toBeInTheDocument();
  });
});
