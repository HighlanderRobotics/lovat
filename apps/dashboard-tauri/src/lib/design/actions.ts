import type { DesignNode } from "./model.ts";
import { textOf } from "./model.ts";

// Frame IDs retain a direct link from each prototype state to its Figma source.
export function destination(
  frame: string,
  node: DesignNode,
): string | undefined {
  const label = textOf(node);
  const id = frame.split(":").pop()!;
  const to = (value: number) => `5775:${value}`;
  if (node.name === "Question selection") return to(14562);
  if (
    node.id === "I5775:10088;54:171;43:192" ||
    node.id === "I5775:10088;54:171"
  )
    return to(10120);
  if (
    node.name === "Icon" &&
    node.children.some(
      (child) =>
        typeof child !== "string" && child.src === "/design-assets/3589c.svg",
    )
  )
    return to(id === "10069" ? 10120 : 14128);
  if (node.name === "TabBarItem")
    return to(
      (
        {
          Home: 9807,
          Scouting: 17119,
          Forms: 10069,
          Picklists: 17181,
          Strategy: 17278,
        } as Record<string, number>
      )[label] ?? 9807,
    );
  if (label === "Lovat") return "catalog";
  if (node.name === "Avatar" || (node.name === "Action" && label === "CC"))
    return to(14720);
  if (node.name === "lucide/search")
    return to(
      id === "9807"
        ? 9936
        : Number(id) >= 17119
          ? 17528
          : id === "14810"
            ? 16335
            : id === "15277"
              ? 16407
              : id === "15945"
                ? 16455
                : 9936,
    );
  if (node.name === "lucide/x")
    return to(
      id === "9936"
        ? 9807
        : Number(id) >= 17119
          ? 17119
          : id === "16335"
            ? 14810
            : id === "16407"
              ? 15277
              : 15945,
    );
  if (node.name === "lucide/refresh-ccw")
    return to(
      (
        { 17374: 17384, 17384: 17394, 17394: 17278, 17278: 17181 } as Record<
          string,
          number
        >
      )[id] ?? 17181,
    );
  if (node.name === "Segment")
    return to(
      label === "Official Rank" ? 17119 : label === "Record" ? 17404 : 17466,
    );
  if (node.id?.endsWith("43:192") || node.name === "lucide/arrow-left")
    return to(backDestination(id));
  if (node.name === "lucide/settings") return to(14720);
  if (node.name === "lucide/wand") return to(11203);
  if (node.name === "lucide/info") return to(12283);
  if (node.name === "lucide/pencil")
    return to(
      Number(id) >= 14235 && Number(id) <= 14394
        ? 14350
        : id === "10457"
          ? 10624
          : 10925,
    );
  if (
    node.name === "lucide/square-pen" &&
    Number(id) >= 15107 &&
    Number(id) <= 15277
  )
    return to(id === "15180" || id === "15211" ? 15228 : 15253);
  if (node.name === "lucide/copy") return to(id === "15445" ? 15445 : 10766);
  if (node.name === "TableRow")
    return to(id === "15322" ? 15503 : id === "15503" ? 15604 : 15322);
  if (node.name === "Checkbox" && Number(id) >= 14879 && Number(id) <= 14968)
    return to(id === "14879" ? 14922 : 14879);
  const globals: Record<string, number> = {
    "At tournament": 14810,
    "Team Source": 15945,
    "Tournament Source": 15277,
    "Lovat API": 15322,
    "Export data": 15371,
    "Manage my Team": 16149,
    "View all members": 15010,
    "Promote Analysts": 14879,
    "Create form": 14699,
    "Find a template": 14699,
    "Use template": 10144,
    "Add new question": 14183,
    Questions: 10144,
    Assignments: 10200,
    Type: 14183,
    Options: 14235,
    "Save changes": 14514,
    "Save assignments": 10200,
    "Create a new key": 15386,
    "Rename key": 15753,
    "Delete key": 15553,
    "Delete 2 keys": 15895,
    "Apply changes": 14720,
    "Just this tournament": 15277,
    "Just my team": 15945,
    Promote: 15131,
    "Remove account": 15147,
    "Delete my Account": 15163,
    "Log out": 14769,
  };
  if (label === "Cancel") return to(backDestination(id));
  if (label === "Done") return to(id === "15445" ? 15653 : 16149);
  if (label === "Create") return to(15445);
  if (label === "Rename")
    return to(id === "15753" ? 15812 : id === "15228" ? 15180 : 15116);
  if (label === "Change") return to(16220);
  if (label === "Resend") return to(16257);
  if (label === "Button" && id === "16257") return to(16294);
  if (label === "Assign") return to(10287);
  if (label === "Delete")
    return to(
      id === "14562"
        ? 14630
        : id === "15553"
          ? 15712
          : id === "15895"
            ? 15863
            : id === "14630"
              ? 14466
              : 10457,
    );
  if (label === "Edit") return to(14235);
  if (label.startsWith("Promote ") && label.includes("Analyst"))
    return to(14968);
  if (label === "Manage assignments")
    return to(
      id === "10200"
        ? 10287
        : id === "11985" || id === "12872" || id === "13803"
          ? 10766
          : 10457,
    );
  if (node.name === "SelectableCard") {
    if (id === "14183")
      return to(
        label === "Rating"
          ? 14235
          : label === "Photo"
            ? 14284
            : label === "Single select"
              ? 14305
              : label === "Multiple Select"
                ? 14394
                : 14265,
      );
    if (id === "10144")
      return to(
        label.startsWith("Rate")
          ? 14235
          : label.startsWith("Photo")
            ? 14284
            : label.startsWith("Have")
              ? 14305
              : label.startsWith("What")
                ? 14394
                : 14265,
      );
    if (label === "Add a scouter") return to(11203);
    if (label === "Add a shift") return to(id === "10457" ? 10624 : 10925);
  }
  if (label in globals) return to(globals[label]);
  if (node.name === "ListItem") {
    if (id === "14699") return to(14128);
    for (const [prefix, value] of Object.entries(globals))
      if (label.startsWith(prefix + " ")) return to(value);
    if (label.startsWith("Email")) return to(16180);
    if (
      label.startsWith("DCMP") ||
      label.startsWith("SF Pit") ||
      label.startsWith("[WIP]")
    )
      return to(10144);
    if (label.startsWith("CC Collin")) return to(15180);
    if (Number(id) >= 15010 && Number(id) <= 15083) return to(15116);
  }
  if (label === "Matches") return to(16503);
  if (label === "Teams") return to(17119);
  if (node.name.startsWith("Qualification "))
    return to(id === "11390" ? 13164 : id === "11985" ? 13803 : 16503);
  if (node.name === "lucide/plus" || node.name === "lucide/plus-circle")
    return to(10120);
  return undefined;
}

function backDestination(id: string): number {
  if (["15553", "15753"].includes(id)) return 15503;
  if (id === "15895") return 15604;
  if (
    [
      "15386",
      "15445",
      "15503",
      "15604",
      "15653",
      "15712",
      "15812",
      "15863",
    ].includes(id)
  )
    return 15322;
  if (id === "14630") return 14562;
  if (["14350", "14394"].includes(id)) return 14305;
  if (Number(id) >= 14183 && Number(id) <= 14630) return 10144;
  if (["15131", "15147", "15253"].includes(id)) return 15116;
  if (["15163", "15228"].includes(id)) return 15180;
  if (["15107", "15116", "15180", "15195", "15211"].includes(id)) return 15010;
  if (Number(id) >= 16180 && Number(id) <= 16294) return 16149;
  if (Number(id) >= 10287 && Number(id) <= 11385) return 10200;
  if (["11390", "11985", "12283", "12872", "13164", "13803"].includes(id))
    return 10144;
  if (id === "10144" || id === "10120") return 10069;
  if (id === "14128") return 14699;
  if (id === "14699") return 10120;
  if (Number(id) >= 14810 && Number(id) <= 16502) return 14720;
  return 9807;
}
