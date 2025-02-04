import {
  type EditorState,
  type Extension,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  type Tooltip as TooltipView,
  type ViewUpdate,
  showTooltip,
} from "@codemirror/view";
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  state: EditorState;
  view: EditorView;
};

type TooltipOptions = {
  render: (props: TooltipProps) => React.ReactNode;
  getPosition: (state: EditorState) => number;
};

/**
 * Set up a custom tooltip that renders content with React but uses the CodeMirror
 * suggestions.
 *
 * Note: this is a bit hacky, but there is currently no other way to render custom
 * tooltips with suggestions in CodeMirror.
 */
export function useCustomTooltip({
  render,
  getPosition,
}: TooltipOptions): [Extension[], React.ReactNode] {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const element = useMemo(() => document.createElement("div"), []);

  const [update, setUpdate] = useState<ViewUpdate | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const handleFocus = useCallback(() => setHasFocus(true), []);
  const handleBlur = useCallback(() => setHasFocus(false), []);

  const extensions = useMemo(
    () => [
      tooltip(element, getPosition),
      EditorView.domEventHandlers({
        focus: handleFocus,
        blur(evt) {
          evt.preventDefault();
          evt.stopPropagation();

          const el = evt.relatedTarget as HTMLElement | null;
          if (
            tooltipRef.current === el ||
            tooltipRef.current?.contains(el) ||
            el?.dataset.elementId === "mantine-popover"
          ) {
            return;
          }

          handleBlur();
        },
      }),
      EditorView.updateListener.of(update => setUpdate(update)),
    ],
    [element, handleBlur, handleFocus, getPosition],
  );

  const handleKeyDown = useCallback(
    function (evt: React.KeyboardEvent) {
      if (!update?.view) {
        return;
      }
      // forward keys to the editor
      return update.view.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: evt.key,
        }),
      );
    },
    [update],
  );

  const children = (
    <div
      ref={tooltipRef}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {update &&
        hasFocus &&
        render({
          state: update.state,
          view: update.view,
        })}
    </div>
  );

  return [extensions, createPortal(children, element)];
}

function tooltip(
  element: HTMLElement,
  getPosition: (state: EditorState) => number,
) {
  function create() {
    const dom = document.createElement("div");
    dom.append(element);
    return { dom, offset: { x: 0, y: 5 } };
  }

  function getCursorTooltips(state: EditorState): readonly TooltipView[] {
    return [
      {
        pos: getPosition(state),
        above: false,
        strictSide: true,
        arrow: false,
        create,
      },
    ];
  }

  return StateField.define<readonly TooltipView[]>({
    create: getCursorTooltips,
    update(_, transaction) {
      return getCursorTooltips(transaction.state);
    },
    provide: f => showTooltip.computeN([f], state => state.field(f)),
  });
}
