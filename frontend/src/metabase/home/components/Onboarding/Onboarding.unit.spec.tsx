import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";

import { Onboarding } from "./Onboarding";
import type { ChecklistItemValue } from "./types";

const setup = () => {
  const scrollIntoViewMock = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

  const state = createMockState();

  renderWithProviders(
    <Route path="/getting-started" component={Onboarding} />,
    {
      initialRoute: "/getting-started",
      storeInitialState: state,
      withRouter: true,
    },
  );

  return { scrollIntoViewMock };
};

const getItem = (checklistItem: ChecklistItemValue) => {
  return screen.getByTestId(`${checklistItem}-item`);
};
const getItemControl = (label: string) => {
  const labelRegex = new RegExp(label, "i");

  return screen.getByRole("button", {
    name: labelRegex,
  });
};

describe("Onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should have four sections by default", () => {
    setup();

    [
      "Set up your Metabase",
      "Start visualizing your data",
      "Get email updates and alerts",
      "Get the most out of Metabase",
    ].forEach(section => {
      expect(
        screen.getByRole("heading", { name: section }),
      ).toBeInTheDocument();
    });
  });

  it("'database' accordion item should be open by default", () => {
    setup();

    const databaseItem = getItem("database");
    const databaseItemControl = getItemControl("Connect to your database");
    const cta = within(databaseItem).getByRole("link");

    expect(databaseItem).toHaveAttribute("data-active", "true");
    expect(databaseItemControl).toHaveAttribute("data-active", "true");
    expect(databaseItemControl).toHaveAttribute("aria-expanded", "true");

    expect(
      within(databaseItem).getByText(
        "You can connect multiple databases, and query them directly with the query builder or the Native/SQL editor. Metabase connects to more than 15 popular databases.",
      ),
    ).toBeInTheDocument();

    expect(cta).toHaveAttribute("href", "/admin/databases/create");
    expect(
      within(cta).getByRole("button", { name: "Add Database" }),
    ).toBeInTheDocument();
  });

  it("should be possible to open a different item", async () => {
    setup();

    expect(getItem("database")).toHaveAttribute("data-active", "true");
    await userEvent.click(getItemControl("Query with SQL"));

    expect(getItem("database")).not.toHaveAttribute("data-active");
    expect(getItem("sql")).toHaveAttribute("data-active", "true");
  });

  it("only one item can be expanded at a time", async () => {
    setup();

    const databaseItemControl = getItemControl("Connect to your database");
    const sqlItemControl = getItemControl("Query with SQL");

    expect(databaseItemControl).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(sqlItemControl);

    expect(databaseItemControl).toHaveAttribute("aria-expanded", "false");
    expect(sqlItemControl).toHaveAttribute("aria-expanded", "true");
  });

  describe("Set up section", () => {
    it("connect to your database", () => {
      setup();

      const databaseItem = getItem("database");
      const cta = within(databaseItem).getByRole("link");

      expect(cta).toHaveAttribute("href", "/admin/databases/create");
      expect(
        within(cta).getByRole("button", { name: "Add Database" }),
      ).toBeInTheDocument();
    });

    it("invite people", async () => {
      setup();
      const inviteItem = getItem("invite");

      await userEvent.click(getItemControl("Invite people"));

      expect(within(inviteItem).getAllByRole("link")).toHaveLength(2);

      // expect(primaryCTA).toHaveAttribute("href", "/admin/people");
      // expect(secondaryCTA).toHaveAttribute(
      //   "href",
      //   "/admin/settings/authentication",
      // );

      // expect(
      //   within(primaryCTA).getByRole("button", { name: "Invite people" }),
      // ).toBeInTheDocument();
      // expect(
      //   within(secondaryCTA).getByRole("button", {
      //     name: "Set up Single Sign-on",
      //   }),
      // ).toBeInTheDocument();
    });
  });
});
