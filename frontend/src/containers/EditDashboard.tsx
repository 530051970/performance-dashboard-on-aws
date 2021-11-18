import React, { useState } from "react";
import dayjs from "dayjs";
import { useHistory, useParams } from "react-router-dom";
import Link from "../components/Link";
import {
  useDashboard,
  useDashboardVersions,
  useChangeBackgroundColor,
  useWindowSize,
} from "../hooks";
import { Widget, LocationState, WidgetType, DashboardState } from "../models";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import BackendService from "../services/BackendService";
import OrderingService from "../services/OrderingService";
import Breadcrumbs from "../components/Breadcrumbs";
import WidgetList from "../components/WidgetList";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import Tooltip from "../components/Tooltip";
import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import AlertContainer from "../containers/AlertContainer";
import DashboardHeader from "../components/DashboardHeader";
import PrimaryActionBar from "../components/PrimaryActionBar";
import { useTranslation } from "react-i18next";

interface PathParams {
  dashboardId: string;
}

function EditDashboard() {
  const { t } = useTranslation();
  const windowSize = useWindowSize();
  const history = useHistory<LocationState>();
  const { dashboardId } = useParams<PathParams>();
  const { dashboard, reloadDashboard, setDashboard, loading } =
    useDashboard(dashboardId);
  const [isOpenPublishModal, setIsOpenPublishModal] = useState(false);
  const [isOpenDeleteModal, setIsOpenDeleteModal] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [widgetToDelete, setWidgetToDelete] = useState<Widget | undefined>(
    undefined
  );
  const { versions } = useDashboardVersions(dashboard?.parentDashboardId);

  const publishedOrArchived = versions.find(
    (v) =>
      v.state === DashboardState.Published ||
      v.state === DashboardState.Archived
  );

  const isMobile = windowSize.width <= 600;

  const onAddContent = async () => {
    history.push(`/admin/dashboard/${dashboardId}/add-content`);
  };

  const onPreview = () => {
    history.push(`/admin/dashboard/${dashboardId}`);
  };

  const closePublishModal = () => {
    setIsOpenPublishModal(false);
  };

  const closeDeleteModal = () => {
    setIsOpenDeleteModal(false);
  };

  const onPublishDashboard = () => {
    setIsOpenPublishModal(true);
  };

  const onDeleteWidget = (widget: Widget) => {
    setWidgetToDelete(widget);
    setIsOpenDeleteModal(true);
  };

  const onDuplicateWidget = async (widget: Widget) => {
    if (dashboard && widget) {
      await BackendService.duplicateWidget(
        dashboardId,
        widget.id,
        widget.updatedAt,
        t("Copy")
      );

      history.replace(`/admin/dashboard/edit/${dashboardId}`, {
        alert: {
          type: "success",
          message: `${t(
            widget.widgetType === WidgetType.Chart
              ? widget.content.chartType
              : widget.widgetType
          )} '${widget.name}' ${t("DashboardWasCopied")}`,
        },
      });

      await reloadDashboard();
    }
  };

  const publishDashboard = async () => {
    closePublishModal();

    if (dashboard) {
      await BackendService.publishPending(dashboard.id, dashboard.updatedAt);

      history.push(`/admin/dashboard/${dashboard.id}/publish`);
    }
  };

  const deleteWidget = async () => {
    closeDeleteModal();

    if (dashboard && widgetToDelete) {
      await BackendService.deleteWidget(dashboardId, widgetToDelete.id);

      history.replace(`/admin/dashboard/edit/${dashboardId}`, {
        alert: {
          type: "success",
          message: `${t(
            widgetToDelete.widgetType === WidgetType.Chart
              ? widgetToDelete.content.chartType
              : widgetToDelete.widgetType
          )} '${widgetToDelete.name}' ${t("DashboardWasDeleted")}`,
        },
      });

      await reloadDashboard();
    }
  };

  const onMoveWidgetUp = async (index: number) => {
    return setWidgetOrder(index, index - 1);
  };

  const onMoveWidgetDown = async (index: number) => {
    return setWidgetOrder(index, index + 1);
  };

  const setWidgetOrder = async (index: number, newIndex: number) => {
    if (dashboard) {
      const widgets = OrderingService.moveWidget(
        dashboard.widgets,
        index,
        newIndex
      );

      // if no change in order ocurred, exit
      if (widgets === dashboard.widgets) {
        return;
      }

      try {
        setDashboard({ ...dashboard, widgets }); // optimistic ui
        await BackendService.setWidgetOrder(dashboardId, widgets);
      } finally {
        await reloadDashboard(false);
      }
    }
  };

  const onDrag = async (index: number, newIndex: number) => {
    if (dashboard && !reordering) {
      setReordering(true);
      const widgets = OrderingService.moveWidget(
        dashboard.widgets,
        index,
        newIndex
      );

      // if no change in order ocurred, exit
      if (widgets === dashboard.widgets) {
        setReordering(false);
        return;
      }

      try {
        setDashboard({ ...dashboard, widgets });
        await BackendService.setWidgetOrder(dashboardId, widgets);
      } finally {
        await reloadDashboard(false);
        setReordering(false);
      }
    }
  };

  useChangeBackgroundColor();

  const statusAndVersion = (
    <ul className="usa-button-group display-inline">
      <li className="usa-button-group__item display-inline">
        <span className="usa-tag" style={{ cursor: "text" }}>
          {t("Draft")}
        </span>
      </li>
      <li
        className={`usa-button-group__item display-inline${
          publishedOrArchived ? "" : " cursor-default"
        }`}
      >
        <span
          className={`${publishedOrArchived ? "text-underline" : ""}`}
          data-for="version"
          data-tip=""
          data-event="click"
          data-border={true}
          style={{ cursor: "pointer" }}
        >
          <FontAwesomeIcon icon={faCopy} className="margin-right-1" />
          {t("Version")} {dashboard?.version}
        </span>
        {publishedOrArchived && (
          <Tooltip
            id="version"
            place="bottom"
            type="light"
            effect="solid"
            offset={{ right: 14 }}
            getContent={() => (
              <div className="font-sans-sm">
                <p className="margin-top-0">
                  {t("VersionDashboard")}
                  <br />
                  {publishedOrArchived.state.toLowerCase()}.
                </p>
                <Link
                  target="_blank"
                  to={`/admin/dashboard${
                    publishedOrArchived.state === DashboardState.Archived
                      ? "/archived"
                      : ""
                  }/${publishedOrArchived.id}`}
                >
                  {t("ViewVersion", {
                    state: publishedOrArchived.state.toLowerCase(),
                  })}
                  <FontAwesomeIcon
                    className="margin-left-1"
                    icon={faExternalLinkAlt}
                    size="sm"
                  />
                </Link>
              </div>
            )}
            clickable
          />
        )}
      </li>
    </ul>
  );

  const lastSavedAndButtons = (
    <>
      <span className="text-base-dark margin-right-1">
        {dashboard &&
          `${t("LastSaved")} ${dayjs(dashboard.updatedAt)
            .locale(window.navigator.language.toLowerCase())
            .fromNow()}`}
      </span>
      {isMobile && (
        <div className="grid-row margin-top-1">
          <div className="grid-col-6 padding-right-05">
            <Button variant="outline" onClick={onPreview}>
              {t("PreviewButton")}
            </Button>
          </div>
          <div className="grid-col-6 padding-left-05">
            <span data-for="publish" data-tip="">
              <Button variant="base" onClick={onPublishDashboard}>
                {t("PublishButton")}
              </Button>
            </span>
            <Tooltip
              id="publish"
              place="bottom"
              effect="solid"
              offset={{ bottom: 8 }}
              getContent={() => (
                <div className="font-sans-sm">
                  {t("PrepareDashboardForPublishing")}
                </div>
              )}
            />
          </div>
        </div>
      )}
      {!isMobile && (
        <>
          <Button
            className={`${isMobile ? "margin-top-1" : ""}`}
            variant="outline"
            onClick={onPreview}
          >
            {t("PreviewButton")}
          </Button>
          <span data-for="publish" data-tip="">
            <Button variant="base" onClick={onPublishDashboard}>
              {t("PublishButton")}
            </Button>
          </span>
          <Tooltip
            id="publish"
            place="bottom"
            effect="solid"
            offset={{ bottom: 8 }}
            getContent={() => (
              <div className="font-sans-sm">
                {t("PrepareDashboardForPublishing")}
              </div>
            )}
          />
        </>
      )}
    </>
  );

  return (
    <>
      <AlertContainer id="top-alert" />
      <AlertContainer />
      <Breadcrumbs
        crumbs={[
          {
            label: t("Dashboards"),
            url: "/admin/dashboards",
          },
          {
            label: dashboard?.name,
          },
        ]}
      />

      <Modal
        isOpen={isOpenPublishModal}
        closeModal={closePublishModal}
        title={`${t("PreparePublishingModalTitle.part1")}${dashboard?.name}${t(
          "PreparePublishingModalTitle.part2"
        )}`}
        message={`${
          dashboard?.widgets.length === 0
            ? `${t("PreparePublishingModalMessage.part1")}`
            : ""
        }${t("PreparePublishingModalMessage.part2")}`}
        buttonType={t("PreparePublishingModalButton")}
        buttonAction={publishDashboard}
      />

      <Modal
        isOpen={isOpenDeleteModal}
        closeModal={closeDeleteModal}
        title={
          widgetToDelete
            ? `${t("Delete")} ${widgetToDelete.widgetType.toLowerCase()} ${t(
                "ContentItem"
              )}: "${widgetToDelete.name}"`
            : ""
        }
        message={
          widgetToDelete?.widgetType === WidgetType.Section
            ? t("DeletingSectionContentItem")
            : t("DeletingContentItem")
        }
        buttonType={t("Delete")}
        buttonAction={deleteWidget}
      />

      {loading || !versions ? (
        <Spinner
          className="text-center margin-top-9"
          label={t("LoadingSpinnerLabel")}
        />
      ) : (
        <>
          {isMobile && (
            <PrimaryActionBar>
              {statusAndVersion}
              <div className="margin-top-2">{lastSavedAndButtons}</div>
            </PrimaryActionBar>
          )}
          {!isMobile && (
            <PrimaryActionBar className="grid-row" stickyPosition={75}>
              <div className="grid-col-4 text-left flex-row flex-align-center display-flex">
                {statusAndVersion}
              </div>
              <div className="grid-col-8 text-right">{lastSavedAndButtons}</div>
            </PrimaryActionBar>
          )}

          <DashboardHeader
            name={dashboard?.name}
            topicAreaName={dashboard?.topicAreaName}
            description={dashboard?.description}
            unpublished
            link={
              <Link to={`/admin/dashboard/edit/${dashboard?.id}/header`}>
                <span className={`${isMobile ? "" : "margin-left-2"}`}>
                  {t("EditHeader")}
                </span>
              </Link>
            }
            isMobile={isMobile}
          />

          <WidgetList
            widgets={dashboard ? dashboard.widgets : []}
            onClick={onAddContent}
            onDelete={onDeleteWidget}
            onDuplicate={onDuplicateWidget}
            onMoveUp={onMoveWidgetUp}
            onMoveDown={onMoveWidgetDown}
            onDrag={onDrag}
          />
        </>
      )}
    </>
  );
}

export default EditDashboard;
