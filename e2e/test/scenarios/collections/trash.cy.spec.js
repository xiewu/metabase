import { P, isMatching } from "ts-pattern";

const { H } = cy;
import {
  FIRST_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
  READ_ONLY_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > collections > trash", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("trash collection should be treated different in ui", () => {
    createCollection({ name: "Collection A" }, true);
    createNativeQuestion(
      {
        type: "model",
        name: "Model A",
        native: { query: "select * from products limit 5" },
      },
      true,
    );
    cy.visit("/");

    cy.log("should show trash at bottom of the side navbar");
    H.navigationSidebar().within(() => {
      // eslint-disable-next-line no-unsafe-element-filtering
      cy.findAllByTestId("sidebar-collection-link-root")
        .last()
        .as("sidebar-trash-link")
        .should("contain", "Trash");
    });

    cy.log("should not be expandable in sidebar with items in it");
    cy.get("@sidebar-trash-link").within(() => {
      cy.icon("chevronright").should("not.be.visible");
    });

    cy.log("table headers should say deleted by / deleted at");
    cy.get("@sidebar-trash-link").click();
    cy.findByTestId("items-table-head").within(() => {
      cy.findByText("Deleted by");
      cy.findByText("Deleted at");
    });

    cy.log(
      "trashed items in collection should not have option to move to trash",
    );
    toggleEllipsisMenuFor("Collection A");
    H.popover().within(() => {
      cy.findByText("Move to trash").should("not.exist");
      cy.findByText("Restore").should("exist");
      cy.findByText("Delete permanently").should("not.exist");
    });
    toggleEllipsisMenuFor("Collection A");

    cy.log("items in trash should have greyed out icons");
    collectionTable().within(() => {
      cy.icon("model").should("have.css", "color", "rgb(148, 154, 171)");
    });

    cy.log("there should not be pins in the trash");
    cy.findByTestId("pinned-items").should("not.exist");

    cy.log("trash should not appear in 'our analtyics'");
    visitRootCollection();
    collectionTable().within(() => {
      cy.findByText("Trash").should("not.exist");
    });

    cy.log("trash should not appear in query builder source picker");
    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });

    H.popover().findByText("Question").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();
      cy.findByText("Our analytics").should("exist");
      cy.findByText("Trash").should("not.exist");
      cy.button("Close").click();
    });

    cy.log("trash should not appear in collection picker");
    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });
    H.popover().findByText("Dashboard").click();
    H.modal().findByText("Our analytics").click();
    H.entityPickerModal().within(() => {
      cy.findByText("First collection").should("exist");
      cy.findByText("Trash").should("not.exist");
    });

    cy.log("trash should not appear in collection permissions sidebar");
    cy.visit("/admin/permissions/collections");
    H.sidebar().findByText("Trash").should("not.exist");
  });

  H.describeWithSnowplow("", () => {
    beforeEach(() => {
      H.resetSnowplow();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should be able to trash & restore dashboards/collections/questions on entity page and from parent collection", () => {
      cy.log("create test resources");
      cy.log("Bookmark the resources to test metabase#44224");
      createCollection({ name: "Collection A" }).then((collection) => {
        cy.request("POST", `/api/bookmark/collection/${collection.id}`);
      });
      createDashboard({ name: "Dashboard A" }).then((dashboard) => {
        cy.request("POST", `/api/bookmark/dashboard/${dashboard.id}`);
      });
      createNativeQuestion({
        name: "Question A",
        native: { query: "select 1;" },
      }).then((question) => {
        cy.request("POST", `/api/bookmark/card/${question.id}`);
      });

      visitRootCollection();

      cy.log("should be able to move to trash from collection view");
      toggleEllipsisMenuFor(/Collection A/);
      H.popover().findByText("Move to trash").click();
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: "moved-to-trash",
            event_detail: "collection",
            target_id: P.number,
            triggered_from: "collection",
            duration_ms: P.number,
            result: "success",
          },
          event,
        ),
      );

      toggleEllipsisMenuFor("Dashboard A");
      H.popover().findByText("Move to trash").click();
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: "moved-to-trash",
            event_detail: "dashboard",
            target_id: P.number,
            triggered_from: "collection",
            duration_ms: P.number,
            result: "success",
          },
          event,
        ),
      );

      toggleEllipsisMenuFor("Question A");
      H.popover().findByText("Move to trash").click();
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: "moved-to-trash",
            event_detail: "question",
            target_id: P.number,
            triggered_from: "collection",
            duration_ms: P.number,
            result: "success",
          },
          event,
        ),
      );

      cy.log(
        "should be able to move to restore items from trash collection view",
      );
      H.navigationSidebar().findByText("Trash").click();

      toggleEllipsisMenuFor(/Collection A/);
      H.popover().findByText("Restore").click();
      ensureBookmarkVisible(/Collection A/);

      toggleEllipsisMenuFor("Dashboard A");
      H.popover().findByText("Restore").click();
      ensureBookmarkVisible("Dashboard A");

      toggleEllipsisMenuFor("Question A");
      H.popover().findByText("Restore").click();
      ensureBookmarkVisible("Question A");

      cy.log("should be able to archive entities from their own views");
      visitRootCollection();

      // collection
      collectionTable().within(() => {
        cy.findByText("Collection A").click();
      });
      cy.findByTestId("collection-menu").find(".Icon-ellipsis").click();
      H.popover().findByText("Move to trash").click();
      H.modal().within(() => {
        cy.findByText("Move this collection to trash?");
        cy.findByText("Move to trash").click();
      });
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: "moved-to-trash",
            event_detail: "collection",
            target_id: P.number,
            triggered_from: "detail_page",
            duration_ms: P.number,
            result: "success",
          },
          event,
        ),
      );
      ensureCanRestoreFromPage("Collection A");
      ensureBookmarkVisible("Collection A");

      // dashboard
      collectionTable().within(() => {
        cy.findByText("Dashboard A").click();
      });
      cy.findByTestId("dashboard-header").icon("ellipsis").click();
      H.popover().findByText("Move to trash").click();
      H.modal().within(() => {
        cy.findByText("Move this dashboard to trash?");
        cy.findByText("Move to trash").click();
      });
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: "moved-to-trash",
            event_detail: "dashboard",
            target_id: P.number,
            triggered_from: "detail_page",
            duration_ms: P.number,
            result: "success",
          },
          event,
        ),
      );
      visitRootCollection();
      collectionTable().within(() => {
        cy.findByText("Dashboard A").should("not.exist");
      });
      ensureCanRestoreFromPage("Dashboard A");
      ensureBookmarkVisible("Dashboard A");

      // question
      collectionTable().within(() => {
        cy.findByText("Question A").click();
      });
      cy.findByTestId("qb-header-action-panel").icon("ellipsis").click();
      H.popover().findByText("Move to trash").click();
      H.modal().within(() => {
        cy.findByText("Move this question to trash?");
        cy.findByText("Move to trash").click();
      });
      H.expectUnstructuredSnowplowEvent((event) =>
        isMatching(
          {
            event: "moved-to-trash",
            event_detail: "question",
            target_id: P.number,
            triggered_from: "detail_page",
            duration_ms: P.number,
            result: "success",
          },
          event,
        ),
      );
      visitRootCollection();
      collectionTable().within(() => {
        cy.findByText("Question A").should("not.exist");
      });
      ensureCanRestoreFromPage("Question A");
      ensureBookmarkVisible("Question A");
    });
  });

  it("should not show restore option if entity is within nested in an archived collection list", () => {
    cy.log("create test resources");
    createCollection({ name: "Collection A" })
      .as("collectionA")
      .then((a) => createCollection({ name: "Collection B", parent_id: a.id }));

    cy.get("@collectionA").then((collectionA) => {
      H.archiveCollection(collectionA.id);
    });

    cy.log("only shows restore in root trash collection");
    cy.visit("/trash");

    toggleEllipsisMenuFor("Collection A");
    H.popover().findByText("Restore").should("exist");
    collectionTable().findByText("Collection A").click();

    toggleEllipsisMenuFor("Collection B");
    H.popover().findByText("Restore").should("not.exist");

    cy.log("only shows restore on entity page if in root trash collection");
    cy.visit("/trash");
    collectionTable().findByText("Collection A").click();
    archiveBanner().findByText("Restore").should("exist");
    collectionTable().findByText("Collection B").click();
    archiveBanner().findByText("Restore").should("not.exist");
  });

  it("should be able to move <entity> out of trash collection", () => {
    cy.log("create test resources");
    createCollection({ name: "Collection A" }, true);
    createCollection({ name: "Collection B" }, true);
    createDashboard({ name: "Dashboard A" }, true);
    createDashboard({ name: "Dashboard B" }, true);
    const query = { native: { query: "select 1;" } };
    createNativeQuestion({ name: "Question A", ...query }, true);
    createNativeQuestion({ name: "Question B", ...query }, true);

    cy.log("can move from trash list");
    cy.visit("/trash");
    toggleEllipsisMenuFor("Collection A");
    H.popover().findByText("Move").click();
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    toggleEllipsisMenuFor("Dashboard A");
    H.popover().findByText("Move").click();
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    toggleEllipsisMenuFor("Question A");
    H.popover().findByText("Move").click();
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    collectionTable().within(() => {
      cy.findByText("Collection A").should("not.exist");
      cy.findByText("Dashboard A").should("not.exist");
      cy.findByText("Question A").should("not.exist");
    });

    cy.visit(`/collection/${FIRST_COLLECTION_ID}`);

    collectionTable().within(() => {
      cy.findByText("Collection A").should("exist");
      cy.findByText("Dashboard A").should("exist");
      cy.findByText("Question A").should("exist");
    });

    cy.log("can move from entity page");
    cy.visit("/trash");
    collectionTable().within(() => {
      cy.findByText("Collection B").click();
    });
    archiveBanner().within(() => {
      cy.findByText("Move").click();
    });
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });
    archiveBanner().should("not.exist");

    cy.visit("/trash");
    collectionTable().within(() => {
      cy.findByText("Dashboard B").click();
    });
    archiveBanner().within(() => {
      cy.findByText("Move").click();
    });
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });
    archiveBanner().should("not.exist");

    cy.visit("/trash");
    collectionTable().within(() => {
      cy.findByText("Question B").click();
    });
    archiveBanner().within(() => {
      cy.findByText("Move").click();
    });
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });
    archiveBanner().should("not.exist");

    cy.visit("/trash");

    collectionTable().within(() => {
      cy.findByText("Collection A").should("not.exist");
      cy.findByText("Dashboard A").should("not.exist");
      cy.findByText("Question A").should("not.exist");
    });

    cy.visit(`/collection/${FIRST_COLLECTION_ID}`);

    collectionTable().within(() => {
      cy.findByText("Collection A").should("exist");
      cy.findByText("Dashboard A").should("exist");
      cy.findByText("Question A").should("exist");
    });
  });

  it("should be able to permanently delete <entity> on archived entity page or from trash & trashed collections", () => {
    cy.log("create test resources");
    createCollection({ name: "Collection A" }, true);
    createCollection({ name: "Collection B" }, true);
    createDashboard({ name: "Dashboard A" }, true);
    createDashboard({ name: "Dashboard B" }, true);
    const query = { native: { query: "select 1;" } };
    createNativeQuestion({ name: "Question A", ...query }, true);
    createNativeQuestion({ name: "Question B", ...query }, true);

    cy.visit("/trash");

    cy.log("can delete from trash list");
    toggleEllipsisMenuFor("Collection A");
    // FUTURE: replace following two lines with commented out code when collections can be deleted
    H.popover().findByText("Delete permanently").should("not.exist");
    toggleEllipsisMenuFor("Collection A");
    // popover().findByText("Delete permanently").click();
    // modal().findByText("Delete Collection A permanently?").should("exist");
    // modal().findByText("Delete permanently").click();
    // collectionTable().within(() => {
    //   cy.findByText("Collection A").should("not.exist");
    // });

    toggleEllipsisMenuFor("Dashboard A");
    H.popover()
      .should("contain", "Delete permanently")
      .findByText("Delete permanently")
      .click();
    H.modal().findByText("Delete Dashboard A permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Dashboard A").should("not.exist");
    });

    toggleEllipsisMenuFor("Question A");
    H.popover()
      .should("contain", "Delete permanently")
      .findByText("Delete permanently")
      .click();
    H.modal().findByText("Delete Question A permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Question A").should("not.exist");
    });

    cy.log("should be able to delete from entity page");
    collectionTable().within(() => {
      cy.findByText("Collection B").click();
    });
    // FUTURE: replace following two lines with commented out code when collections can be deleted
    archiveBanner().findByText("Delete permanently").should("not.exist");
    cy.visit("/trash");
    // archiveBanner().findByText("Delete permanently").click();
    // modal().findByText("Delete Collection B permanently?").should("exist");
    // modal().findByText("Delete permanently").click();
    // collectionTable().within(() => {
    //   cy.findByText("Collection B").should("not.exist");
    // });

    collectionTable().within(() => {
      cy.findByText("Dashboard B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    H.modal().findByText("Delete Dashboard B permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Dashboard B").should("not.exist");
    });

    collectionTable().within(() => {
      cy.findByText("Question B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    H.modal().findByText("Delete Question B permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Question B").should("not.exist");
    });
  });

  describe("bulk actions", () => {
    beforeEach(() => {
      createCollection({ name: "Collection A" }, true);
      createDashboard({ name: "Dashboard A" }, true);
      createNativeQuestion(
        { name: "Question A", native: { query: "select 1;" } },
        true,
      );
      cy.visit("/trash");
    });

    it("user should be able to bulk restore", () => {
      selectItem("Collection A");
      selectItem("Dashboard A");
      selectItem("Question A");

      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.findByText("Delete permanently").should("not.be.disabled");
          cy.findByText("Move").should("not.be.disabled");
          cy.findByText("Restore").should("not.be.disabled").click();
        });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("not.exist");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });
    });

    it("user should be able to bulk move out of trash", () => {
      selectItem("Collection A");
      selectItem("Dashboard A");
      selectItem("Question A");

      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.findByText("Restore").should("not.be.disabled");
          cy.findByText("Delete permanently").should("not.be.disabled");
          cy.findByText("Move").should("not.be.disabled").click();
        });

      H.modal().within(() => {
        cy.findByText("First collection").click();
        cy.findByText("Move").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("not.exist");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });

      H.navigationSidebar().within(() => {
        cy.findByText("First collection").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("exist");
        cy.findByText("Dashboard A").should("exist");
        cy.findByText("Question A").should("exist");
      });
    });

    it("user should be able to bulk delete", () => {
      selectItem("Dashboard A");
      selectItem("Question A");

      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.findByText("Restore").should("not.be.disabled");
          cy.findByText("Move").should("not.be.disabled");
          cy.findByText("Delete permanently").should("not.be.disabled").click();
        });

      H.modal().within(() => {
        cy.findByText("Delete 2 items permanently?");
        cy.findByText("Delete permanently").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("exist");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });
    });
  });

  it("users should not be able to edit archived entities", () => {
    createDashboard({ name: "Dashboard A" }, true).as("dashboard");
    createQuestion(
      {
        name: "Question A",
        query: { "source-table": 1, limit: 10 },
      },
      true,
    ).as("question");

    cy.get("@question").then((question) => {
      H.visitQuestion(question.id);
      // should not have disabled actions in top navbar
      cy.findAllByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Filter").should("not.exist");
        cy.findByText("Summarize").should("not.exist");
        cy.findByTestId("notebook-button").should("not.exist");
        cy.icon("bookmark").should("not.exist");
        cy.icon("ellipsis").should("not.exist");
        H.sharingMenuButton().should("not.exist");
      });

      // should not have disabled action in bottom footer
      cy.findAllByTestId("view-footer").within(() => {
        cy.findByText("Visualization").should("not.exist");
      });
    });

    cy.get("@dashboard").then((dashboard) => {
      H.visitDashboard(dashboard.id);

      cy.findAllByTestId("dashboard-header").within(() => {
        cy.icon("pencil").should("not.exist");
        H.sharingMenuButton().should("not.exist");
        cy.icon("clock").should("not.exist");
        cy.icon("bookmark").should("not.exist");
        cy.icon("ellipsis").should("not.exist");
      });
    });
  });

  it("user should not be shown restore/move/delete options in archive banner if they have view only permissions", () => {
    createCollection({ name: "Collection A" }).as("collection");

    cy.get("@collection").then((collection) => {
      createNativeQuestion(
        {
          name: "Question A",
          native: { query: "select 1;" },
          collection_id: collection.id,
        },
        true,
      ).as("question");
      createDashboard(
        { name: "Dashboard A", collection_id: collection.id },
        true,
      ).as("dashboard");

      cy.visit("/admin/permissions/collections");

      H.selectSidebarItem("Collection A");
      const COLLECTION_ACCESS_PERMISSION_INDEX = 0;

      H.modifyPermission(
        "All Users",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "View",
      );
      H.modifyPermission(
        "collection",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "View",
      );
      H.modifyPermission("data", COLLECTION_ACCESS_PERMISSION_INDEX, "View");

      cy.button("Save changes").click();
      H.modal().within(() => {
        cy.findByText("Save permissions?");
        cy.findByText("Are you sure you want to do this?");
        cy.button("Yes").click();
      });

      H.archiveCollection(collection.id);
    });

    cy.signInAsNormalUser();

    cy.get("@collection").then((collection) => {
      H.visitCollection(collection.id);
      archiveBanner().findByText("Restore").should("not.exist");
      archiveBanner().findByText("Move").should("not.exist");
      archiveBanner().findByText("Delete permanently").should("not.exist");
    });
  });

  it("should hide read-only archived items in trash (metabase#24018)", () => {
    const READ_ONLY_NAME = "read-only dashboard";
    const CURATEABLE_NAME = "curate-able dashboard";

    // setup archive with read-only collection items
    createDashboard(
      {
        name: READ_ONLY_NAME,
        collection_id: null,
      },
      true,
    );

    // setup archive with curate-able collection items (user created items)
    cy.signIn("readonly");

    createDashboard(
      {
        name: CURATEABLE_NAME,
        collection_id: READ_ONLY_PERSONAL_COLLECTION_ID,
      },
      true,
    );

    // assert on desired behavior for read-only user
    cy.visit("/trash");

    cy.get("main").within(() => {
      cy.findByText(READ_ONLY_NAME).should("not.exist");
      cy.findByText(CURATEABLE_NAME).should("be.visible");
    });

    // assert on desired behavior for admin user
    cy.signInAsAdmin();
    cy.visit("/trash");

    cy.get("main").within(() => {
      cy.findByText(READ_ONLY_NAME).should("be.visible");
      cy.findByText(CURATEABLE_NAME).should("be.visible");
    });
  });

  it("should highlight the trash in the navbar when viewing root trash collection or an entity in the trash", () => {
    createCollection({ name: "Collection A" }, true).as("collection");
    createDashboard({ name: "Dashboard A" }, true).as("dashboard");
    createNativeQuestion(
      {
        name: "Question A",
        native: { query: "select 1;" },
      },
      true,
    ).as("question");

    cy.log("Make sure trash is selected for root trash collection");
    cy.visit("/trash");
    assertTrashSelectedInNavigationSidebar();

    cy.log("Make sure trash is selected for a trashed collection");
    cy.get("@collection").then((collection) => {
      cy.intercept("GET", `/api/collection/${collection.id}`).as(
        "getCollection",
      );
      H.visitCollection(collection.id);
      cy.wait("@getCollection");
      assertTrashSelectedInNavigationSidebar();
    });

    cy.log("Make sure trash is selected for a trashed dashboard");
    cy.get("@dashboard").then((dashboard) => {
      cy.intercept("GET", `/api/dashboard/${dashboard.id}*`).as("getDashboard");
      H.visitDashboard(dashboard.id);
      cy.wait("@getDashboard");
      H.openNavigationSidebar();
      assertTrashSelectedInNavigationSidebar();
    });

    cy.log("Make sure trash is selected for a trashed question");
    cy.get("@question").then((question) => {
      cy.log(question.id);
      cy.intercept("POST", `/api/card/${question.id}/query`).as(
        "getQuestionResult",
      );
      H.visitQuestion(question.id);
      cy.wait("@getQuestionResult");
      H.openNavigationSidebar();
      assertTrashSelectedInNavigationSidebar();
    });
  });

  describe("sidebar drag and drop", () => {
    it("should not allow items in the trash to be moved into the trash", () => {
      createDashboard({ name: "Dashboard A" }, true);
      cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
      cy.visit("/trash");

      dragAndDrop(
        H.main().findByText("Dashboard A"),
        H.navigationSidebar().findByText("Trash"),
      );

      cy.wait(100); // small wait to make sure a network request could have gone out
      // assert no update request went out
      cy.get("@updateDashboard.all").should("have.length", 0);
      cy.findByTestId("toast-undo").should("not.exist");
      H.main(() => {
        cy.findByText(/Deleted items will appear here/).should("not.exist");
        cy.findByText("Dashboard A").should("exist");
      });
    });

    it("should allow items in the trash to be moved out of the trash and allow it to be undone", () => {
      createDashboard({ name: "Dashboard A" }, true);
      cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
      cy.visit("/trash");

      dragAndDrop(
        H.main().findByText("Dashboard A"),
        H.navigationSidebar().findByText("First collection"),
      );

      cy.get("@updateDashboard.all").should("have.length", 1);
      H.main()
        .findByText(/Deleted items will appear here/)
        .should("exist");
      cy.findByTestId("toast-undo").should("exist");
      H.undo();

      cy.get("@updateDashboard.all").should("have.length", 2);
      H.main().within(() => {
        cy.findByText(/Deleted items will appear here/).should("not.exist");
        cy.findByText("Dashboard A").should("exist");
      });
    });

    it("should allow items outside the trash to be moved in the trash and allow it to be undone", () => {
      createDashboard({
        name: "Dashboard A",
        collection_id: FIRST_COLLECTION_ID,
      });
      cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
      H.visitCollection(FIRST_COLLECTION_ID);

      dragAndDrop(
        H.main().findByText("Dashboard A"),
        H.navigationSidebar().findByText("Trash"),
      );

      cy.get("@updateDashboard.all").should("have.length", 1);
      H.main().findByText("Dashboard A").should("not.exist");
      cy.findByTestId("toast-undo").should("exist");
      H.undo();

      cy.get("@updateDashboard.all").should("have.length", 2);
      H.main().within(() => {
        cy.findByText("Dashboard A").should("exist");
      });
    });
  });

  it("should open only one context menu at a time (metabase#44910)", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { archived: true });
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      archived: true,
    });
    cy.visit("/trash");

    toggleEllipsisMenuFor("Orders");
    cy.findAllByRole("dialog")
      .should("have.length", 1)
      .and("contain", "Move")
      .and("contain", "Restore")
      .and("contain", "Delete permanently");

    toggleEllipsisMenuFor("Orders, Count");
    cy.findAllByRole("dialog")
      .should("have.length", 1)
      .and("contain", "Move")
      .and("contain", "Restore")
      .and("contain", "Delete permanently");
  });
});

function toggleEllipsisMenuFor(item) {
  collectionTable()
    .findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click();
}

function createCollection(collectionInfo, archive) {
  return H.createCollection(collectionInfo)
    .then(({ body: collection }) => {
      return Promise.all([
        collection,
        archive && H.archiveCollection(collection.id),
      ]);
    })
    .then(([collection]) => collection);
}

function createQuestion(questionInfo, archive) {
  return H.createQuestion(questionInfo).then(({ body: question }) =>
    Promise.all([question, archive && H.archiveQuestion(question.id)]).then(
      ([question]) => question,
    ),
  );
}

function createNativeQuestion(questionInfo, archive) {
  return H.createNativeQuestion(questionInfo).then(({ body: question }) =>
    Promise.all([question, archive && H.archiveQuestion(question.id)]).then(
      ([question]) => question,
    ),
  );
}

function createDashboard(dashboardInfo, archive) {
  return H.createDashboard(dashboardInfo)
    .then(({ body: dashboard }) =>
      Promise.all([dashboard, archive && H.archiveDashboard(dashboard.id)]),
    )
    .then(([dashboard]) => dashboard);
}

function visitRootCollection() {
  cy.visit("/collection/root");
}

function collectionTable() {
  return cy.findByTestId("collection-table");
}

function archiveBanner() {
  return cy.findByTestId("archive-banner");
}

function ensureCanRestoreFromPage(name) {
  visitRootCollection();
  collectionTable().within(() => {
    cy.findByText(name).should("not.exist");
  });
  cy.go("back");
  archiveBanner().should("exist");
  archiveBanner().findByText("Restore").click();
  archiveBanner().should("not.exist");
  visitRootCollection();
  collectionTable().within(() => {
    cy.findByText(name).should("exist");
  });
}

function selectItem(name) {
  cy.findByText(name)
    .closest("tr")
    .within(() => cy.findByRole("checkbox").click());
}

function assertTrashSelectedInNavigationSidebar() {
  H.navigationSidebar().within(() => {
    cy.findByText("Trash")
      .parents("li")
      .should("have.attr", "aria-selected", "true");
  });
}

function ensureBookmarkVisible(bookmark) {
  cy.findByRole("tab", { name: /bookmarks/i })
    .findByText(bookmark)
    .should("be.visible");
}

function dragAndDrop(subjectEl, targetEl) {
  const dataTransfer = new DataTransfer();
  subjectEl.trigger("dragstart", { dataTransfer });
  targetEl.trigger("drop", { dataTransfer });
  subjectEl.trigger("dragend");
}
