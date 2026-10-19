/* eslint-disable */
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * CSS Grid for React Native, which has none. The compiler keeps `display: grid` as a marker and the column template
 * as its tracks (`"1fr 1fr"`, `"1fr auto"`, `"120px 1fr"`); a grid lays its children out in rows of those tracks.
 * A cell is a flex item sized from the tracks it spans: shares grow (`fr`), lengths are fixed (`px`), and `auto`
 * hugs its content. A cell spanning tracks starts from the gaps it covers, so its width matches CSS Grid's.
 * Spans come from a child's `col-span-N` / `col-span-full` class at every width.
 */
type Track = { fr: number; px: number; auto: boolean };

const SPAN_CLASS = /(?:^|\s)col-span-(\d+|full)(?=\s|$)/;

function parseTracks(template: unknown): Track[] {
  const tokens =
    typeof template === "string" && template.trim()
      ? template.trim().split(/\s+/)
      : ["1fr"];
  return tokens.map((token) => ({
    fr: token.endsWith("fr") ? parseFloat(token) : 0,
    px: token.endsWith("px") ? parseFloat(token) : 0,
    auto: token === "auto",
  }));
}

function spanOf(child: ReactNode, columns: number) {
  const className =
    isValidElement<{ className?: unknown }>(child) &&
    typeof child.props.className === "string"
      ? child.props.className
      : "";
  const match = SPAN_CLASS.exec(className);
  if (!match) return 1;
  return match[1] === "full"
    ? columns
    : Math.max(1, Math.min(columns, Number(match[1])));
}

function cellStyle(
  tracks: Track[],
  start: number,
  span: number,
  columnGap: number,
) {
  const covered = tracks.slice(start, start + span);
  const grow = covered.reduce((sum, track) => sum + track.fr, 0);
  const basis =
    covered.reduce((sum, track) => sum + track.px, 0) + columnGap * (span - 1);
  if (grow > 0)
    return { flexGrow: grow, flexShrink: 1, flexBasis: basis, minWidth: 0 };
  if (covered.some((track) => track.auto))
    return { flexGrow: 0, flexShrink: 0 };
  return { width: basis, flexGrow: 0, flexShrink: 0 };
}

export function layoutGrid(props: Record<string, any> | undefined | null) {
  const style = props?.style;
  if (!style) return props;
  const flat = Array.isArray(style) ? StyleSheet.flatten(style) : style;
  if (flat?.display !== "grid") return props;
  const {
    display: _display,
    gridTemplateColumns,
    gap,
    rowGap = gap ?? 0,
    columnGap = gap ?? 0,
    alignItems = "stretch",
    ...rest
  } = flat as Record<string, any>;
  const tracks = parseTracks(gridTemplateColumns);
  const rows: { child: ReactNode; start: number; span: number }[][] = [];
  let row: { child: ReactNode; start: number; span: number }[] = [];
  let used = 0;
  for (const child of Children.toArray(props!.children)) {
    const span = spanOf(child, tracks.length);
    if (row.length && used + span > tracks.length) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ child, start: used, span });
    used += span;
  }
  if (row.length) rows.push(row);
  return {
    ...props,
    style: { ...rest, flexDirection: "column", rowGap },
    children: rows.map((cells, rowIndex) => {
      const filled = cells.reduce((sum, cell) => sum + cell.span, 0);
      // Empty tracks at the end of a short row keep the cells in their columns.
      const spacers = tracks
        .slice(filled)
        .map((_, index) =>
          createElement(View, {
            key: `spacer-${index}`,
            style: cellStyle(tracks, filled + index, 1, columnGap as number),
          }),
        );
      return createElement(
        View,
        {
          key: rowIndex,
          style: { flexDirection: "row", columnGap, alignItems },
        },
        ...cells.map(({ child, start, span }, index) =>
          createElement(
            View,
            {
              key:
                isValidElement(child) && child.key != null ? child.key : index,
              style: cellStyle(tracks, start, span, columnGap as number),
            },
            child,
          ),
        ),
        ...spacers,
      );
    }),
  };
}
