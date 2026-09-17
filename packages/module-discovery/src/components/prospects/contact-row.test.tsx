// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactRow } from "./contact-row";

const CONTACT = {
  id: "c1",
  first_name: "Ada",
  last_name: "Lovelace",
  job_title: "CTO",
  email: "ada@acme.com",
  phone: "+91 12345",
  linkedin_url: null,
} as Parameters<typeof ContactRow>[0]["contact"];

afterEach(cleanup);

function setup(contact = CONTACT) {
  const updateAction = vi.fn();
  const deleteAction = vi.fn();
  render(
    <ul>
      <ContactRow contact={contact} updateAction={updateAction} deleteAction={deleteAction} />
    </ul>,
  );
  return { updateAction, deleteAction };
}

describe("ContactRow — collapsed", () => {
  it("shows the full name with the job title beside it", () => {
    setup();

    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText("CTO")).toBeInTheDocument();
  });

  it("joins the available contact details", () => {
    setup();

    expect(screen.getByText("ada@acme.com · +91 12345")).toBeInTheDocument();
  });

  it("falls back when there is no name", () => {
    setup({ ...CONTACT, first_name: null, last_name: null });

    expect(screen.getByText(/\(no name\)/)).toBeInTheDocument();
  });

  it("falls back when there are no details at all", () => {
    setup({ ...CONTACT, email: null, phone: null, linkedin_url: null });

    expect(screen.getByText("No contact details")).toBeInTheDocument();
  });

  it("offers edit and delete", () => {
    setup();

    expect(screen.getByRole("button", { name: "Edit Ada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("labels the edit control generically when the contact has no first name", () => {
    setup({ ...CONTACT, first_name: null });

    expect(screen.getByRole("button", { name: "Edit contact" })).toBeInTheDocument();
  });
});

describe("ContactRow — editing", () => {
  it("opens a form prefilled with every field", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Edit Ada" }));

    expect(screen.getByLabelText("First name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Last name")).toHaveValue("Lovelace");
    expect(screen.getByLabelText("Job title")).toHaveValue("CTO");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@acme.com");
    expect(screen.getByLabelText("Phone")).toHaveValue("+91 12345");
  });

  it("shows empty inputs for null fields rather than the string 'null'", async () => {
    setup({ ...CONTACT, linkedin_url: null });

    await userEvent.click(screen.getByRole("button", { name: "Edit Ada" }));

    expect(screen.getByLabelText("LinkedIn URL")).toHaveValue("");
  });

  it("gives each field a unique id, so several rows can render together", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Edit Ada" }));

    expect(screen.getByLabelText("First name")).toHaveAttribute("id", "firstName-c1");
  });

  it("submits the edited values and closes", async () => {
    const { updateAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit Ada" }));

    await userEvent.clear(screen.getByLabelText("Job title"));
    await userEvent.type(screen.getByLabelText("Job title"), "CEO");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateAction).toHaveBeenCalled());
    expect((updateAction.mock.calls[0]![0] as FormData).get("jobTitle")).toBe("CEO");
    await waitFor(() => expect(screen.queryByLabelText("Job title")).not.toBeInTheDocument());
  });

  it("cancels back to the collapsed row without saving", async () => {
    const { updateAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit Ada" }));

    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(updateAction).not.toHaveBeenCalled();
  });
});
