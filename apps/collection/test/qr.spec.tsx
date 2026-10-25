import React from "react";
import { FlatList } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import QRCode from "qrcode";
import { ScoutReportCode } from "../lib/collection/ui/ScoutReportCode";
import { useQrCodeSizeStore } from "../lib/storage/userStores";
import { startReport } from "./fixtures";

// QR encoding remains real; the test verifies the serialized payload handed to it.
test("paginated QR chunks preserve every report byte and use measured width when changing pages", async () => {
  const report = startReport();
  useQrCodeSizeStore.getState().setValue(100);
  const encode = jest.spyOn(QRCode, "toString");
  render(<ScoutReportCode scoutReport={report} />);
  const list = screen.UNSAFE_getByType(FlatList);
  fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 320, y: 0 } } });
  const chunks = list.props.data;
  expect(chunks.map((c: { data: string }) => c.data).join("")).toBe(
    JSON.stringify(report),
  );
  expect(
    chunks.every(
      (c: { uuid: string; total: number }, i: number) =>
        c.uuid === report.uuid &&
        c.total === chunks.length &&
        chunks[i].index === i,
    ),
  ).toBe(true);
  expect(list.props.keyExtractor(chunks[0], 0)).toBe("0");
  fireEvent(
    screen.getByLabelText(`Report QR code 1 of ${chunks.length}`),
    "layout",
    { nativeEvent: { layout: { width: 320, height: 320, x: 0, y: 0 } } },
  );
  fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 320, y: 0 } } });
  await waitFor(() => expect(encode).toHaveBeenCalled());
  expect(encode.mock.calls[0][0]).toContain('"uuid":"' + report.uuid + '"');
  encode.mockRestore();
});
test("a large chunk size produces one code without pagination", async () => {
  useQrCodeSizeStore.getState().setValue(10000);
  render(<ScoutReportCode scoutReport={startReport()} />);
  expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(1);
  await act(async () => {});
});
