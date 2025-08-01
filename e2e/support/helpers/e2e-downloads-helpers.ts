import xlsx, { type Sheet } from "xlsx";

import {
  getDashboardCard,
  getDashboardCardMenu,
  getEmbeddedDashboardCardMenu,
} from "./e2e-dashboard-helpers";
import { popover } from "./e2e-ui-elements-helpers";

interface DownloadAndAssertParams {
  /** The type of the file we're downloading */
  fileType: "csv" | "xlsx";
  /** needed only for saved questions */
  questionId?: number;
  dashcardId?: number;
  /** a download URL when you want to override the one generated by this util */
  downloadUrl?: string;
  downloadMethod?: "POST" | "GET";
  /** tell SheetJs not to parse values */
  raw?: boolean;
  /** preview the results in the console log */
  logResults?: boolean;
  /** downloading is tested on an embedded resource */
  isEmbed?: boolean;
  /** downloading is tested on a dashboard */
  isDashboard: boolean;
  publicUuid?: string;
  dashboardId?: number;
  enableFormatting?: boolean;
  pivoting?: "pivoted" | "non-pivoted";
}

export const exportFromDashcard = (format: string) => {
  cy.get("[aria-label='Download results']").click();

  popover().within(() => {
    cy.findByText(format).click();
    cy.findByTestId("download-results-button").click();
  });
};

/**
 * Trigger the download of CSV or XLSX files and assert on the results in the related sheet.
 * It applies to both unsaved questions (queries) and the saved ones.
 */
export function downloadAndAssert(
  {
    fileType,
    questionId,
    raw,
    logResults,
    publicUuid,
    dashcardId,
    dashboardId,
    downloadUrl,
    downloadMethod = "POST",
    isDashboard,
    isEmbed = false,
    enableFormatting = true,
    pivoting,
  }: DownloadAndAssertParams,
  callback: (data: Sheet) => void,
) {
  const { method, endpoint } = downloadUrl
    ? { method: downloadMethod, endpoint: downloadUrl }
    : getEndpoint({
        fileType,
        questionId,
        publicUuid,
        dashcardId,
        dashboardId,
      });
  /**
   * Please see the official Cypress example for more details:
   * https://github.com/cypress-io/cypress-example-recipes/blob/master/examples/testing-dom__download/cypress/integration/form-submission-spec.js
   */

  cy.intercept(method, endpoint, (req) => {
    /**
     * We must redirect in order to avoid Cypress being stuck on waiting for the new page to load.
     * Intentionally redirecting to a non-existing page.
     *
     * Explanation:
     * If we redirect to ANY of the existing pages, there's a lot of requests that need to complete for that page.
     *  - This helper function is usually the last piece of code to execute in any given test.
     *  - As soon as the assertions are complete, the new test starts
     *  - Assertions are usually faster than all of the previously mentioned requests from the redirect
     *  - This results in the next test being polluted with the requests that didn't finish from the last one.
     *  - Those "spill-over" requests end up in the beforeEach hook of the next test and can have unexpected results.
     */

    req.redirect("/foo");
  }).as("fileDownload");

  cy.log(`Downloading ${fileType} file`);

  if (isDashboard) {
    if (isEmbed) {
      getDashboardCard().realHover();
      getEmbeddedDashboardCardMenu().click();
    } else {
      getDashboardCardMenu().click();
    }
  }

  cy.get("[aria-label='Download results']").click();

  popover().within(() => {
    cy.findByText(`.${fileType}`).click();

    cy.findByTestId("keep-data-formatted")
      .as("keep-data-formatted")
      .then(($checkbox) => {
        const isChecked = $checkbox.prop("checked");
        if (enableFormatting !== isChecked) {
          cy.get("@keep-data-formatted").click();
        }
      });

    if (pivoting != null) {
      cy.findByTestId("keep-data-pivoted")
        .as("keep-data-pivoted")
        .then(($checkbox) => {
          const isChecked = $checkbox.prop("checked");

          const shouldPivot = pivoting === "pivoted";
          if (shouldPivot !== isChecked) {
            cy.get("@keep-data-pivoted").click();
          }
        });
    }

    cy.findByTestId("download-results-button").click();
  });

  cy.wait("@fileDownload")
    .its("request")
    .then((req) => {
      // The payload for the xlsx is in the binary form
      fileType === "xlsx" && Object.assign(req, { encoding: "binary" });

      cy.request(req).then(({ body }) => {
        ensureDownloadStatusDismissed();
        const { SheetNames, Sheets } = xlsx.read(body, {
          // See the full list of Parsing options: https://github.com/SheetJS/sheetjs#parsing-options
          type: "binary",
          raw,
        });

        const sheetName = SheetNames[0];
        const sheet = Sheets[sheetName];

        logResults && console.log(sheet);

        callback(sheet);
      });
    });
}

export function assertSheetRowsCount(expectedCount: number) {
  return (sheet: any) => {
    const range = xlsx.utils.decode_range(sheet["!ref"]);
    expect(range.e.r).to.eq(expectedCount);
  };
}

export function assertNotEmptyObject(data: any) {
  return Object.keys(data).length > 0;
}

type GetEndPointParams = Pick<
  DownloadAndAssertParams,
  "fileType" | "questionId" | "publicUuid" | "dashcardId" | "dashboardId"
>;

function getEndpoint({
  fileType,
  questionId,
  publicUuid,
  dashcardId,
  dashboardId,
}: GetEndPointParams): {
  endpoint: string;
  method: "POST" | "GET";
} {
  if (dashcardId != null && dashboardId != null) {
    return {
      endpoint: `api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${questionId}/query/${fileType}**`,
      method: "POST",
    };
  }

  if (publicUuid) {
    if (dashcardId) {
      return {
        endpoint: `api/public/dashboard/${publicUuid}/dashcard/${dashcardId}/card/*/${fileType}**`,
        method: "POST",
      };
    }
    return {
      endpoint: `/public/question/${publicUuid}.${fileType}**`,
      method: "GET",
    };
  }

  const questionEndpoint = `/api/card/${questionId}/query/${fileType}**`;
  const queryEndpoint = `/api/dataset/${fileType}**`;

  return {
    endpoint: questionId ? questionEndpoint : queryEndpoint,
    method: "POST",
  };
}

export function ensureDownloadStatusDismissed() {
  // Upon successful export, we display a status popup that automatically closes after a set time.
  //  However, Cypress sometimes hangs after file downloads, making it difficult to determine if
  //  the status popup has already closed on its own or if we need to close it manually which makes
  //  any attempts to close it flaky. As a workaround we wait until it gets removed by itself.
  cy.findByTestId("status-root-container")
    .contains("Download", { timeout: 10000 })
    .should("not.exist");
}
