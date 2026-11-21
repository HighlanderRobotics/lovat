import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, Fragment } from "react";
import { renderButtonContent } from "../lib/components/buttonContent.ts";

const text = (label, key) => createElement("Text", { key }, label);

test("plain and interpolated button labels keep a single text container", () => {
  const result = renderButtonContent(["Match ", 19, null, false], text);
  assert.equal(result.type, "Text");
  assert.deepEqual(result.props.children, ["Match ", 19]);
});

test("selection controls and multiline captions never become inline text", () => {
  const row = createElement(
    "View",
    { style: { flexDirection: "row" } },
    createElement("Checkbox", { selected: true }),
    createElement(
      "View",
      null,
      createElement("Text", null, "Caption\nsecond line"),
    ),
  );
  let textWrappers = 0;
  const result = renderButtonContent(row, () => {
    textWrappers++;
  });
  assert.equal(textWrappers, 0);
  assert.equal(result[0].type, "View");
  assert.equal(result[0].props, row.props);
});

test("mixed labels and layout children wrap only the labels", () => {
  const result = renderButtonContent(
    [
      createElement("Icon", { key: "icon" }),
      "Ready",
      createElement(Fragment, { key: "details" }, createElement("View", null)),
    ],
    text,
  );
  assert.equal(result[0].type, "Icon");
  assert.equal(result[1].type, "Text");
  assert.equal(result[2][0].type, "View");
});

test("empty content does not create an extra text line", () => {
  assert.equal(renderButtonContent([null, false, undefined], text), null);
});
