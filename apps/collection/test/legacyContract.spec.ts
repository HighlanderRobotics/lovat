import { accuracyDescriptions } from "../lib/collection/Accuracy";
import { autoClimbDescriptions } from "../lib/collection/AutoClimb";
import { beachedDescriptions } from "../lib/collection/Beached";
import { climbPositionDescriptions } from "../lib/collection/ClimbPosition";
import { climbSideDescriptions } from "../lib/collection/ClimbSide";
import { endgameClimbDescriptions } from "../lib/collection/EndgameClimb";
import { feederTypeDescriptions } from "../lib/collection/FeederType";
import { fieldTraversalDescriptions } from "../lib/collection/FieldTraversal";
import { intakeTypeDescriptions } from "../lib/collection/IntakeType";
import { robotRoleDescriptions } from "../lib/collection/RobotRole";
import { scoresWhileMovingDescriptions } from "../lib/collection/ScoresWhileMoving";
import { startingPositions } from "../lib/collection/MatchEventPosition";
import {
  getAllianceColorDescription,
  AllianceColor,
} from "../lib/models/AllianceColor";
import {
  MatchType,
  localizeMatchIdentity,
  MatchIdentityLocalizationFormat,
} from "../lib/models/match";
import { meta } from "./fixtures";

it.each([
  { name: "accuracy", data: accuracyDescriptions },
  { name: "auto climb", data: autoClimbDescriptions },
  { name: "beached", data: beachedDescriptions },
  { name: "climb position", data: Object.values(climbPositionDescriptions) },
  { name: "climb side", data: Object.values(climbSideDescriptions) },
  { name: "endgame", data: endgameClimbDescriptions },
  { name: "feeder", data: feederTypeDescriptions },
  { name: "traversal", data: fieldTraversalDescriptions },
  { name: "intake", data: intakeTypeDescriptions },
  { name: "roles", data: robotRoleDescriptions },
  { name: "moving", data: scoresWhileMovingDescriptions },
])(
  "legacy $name choices retain unique labels and numeric wire codes",
  ({ data }) => {
    expect(
      new Set(data.map((choice) => choice.localizedDescription)).size,
    ).toBe(data.length);
    expect(new Set(data.map((choice) => choice.num)).size).toBe(data.length);
    for (const choice of data) {
      expect(choice.localizedDescription.length).toBeGreaterThan(0);
      expect(choice.localizedLongDescription.length).toBeGreaterThan(0);
    }
  },
);
test("legacy start positions and alliance labels preserve their established meaning", () => {
  expect(startingPositions).toEqual({
    LeftTrench: 0,
    LeftBump: 1,
    Hub: 2,
    RightBump: 4,
    RightTrench: 3,
  });
  expect(
    getAllianceColorDescription(AllianceColor.Blue).localizedDescription,
  ).toBe("Blue");
  expect(
    getAllianceColorDescription(AllianceColor.Red).localizedDescription,
  ).toBe("Red");
});
test("match labels distinguish every format and reject an unsupported match type", () => {
  expect(
    localizeMatchIdentity(
      meta.matchIdentity,
      MatchIdentityLocalizationFormat.Short,
    ),
  ).toBe("Q1");
  expect(
    localizeMatchIdentity(
      meta.matchIdentity,
      MatchIdentityLocalizationFormat.Long,
    ),
  ).toBe("Qualifier 1");
  expect(
    localizeMatchIdentity(
      meta.matchIdentity,
      MatchIdentityLocalizationFormat.Full,
    ),
  ).toBe("2023test Qualifier 1");
  expect(() =>
    localizeMatchIdentity(
      { ...meta.matchIdentity, matchType: "invalid" as MatchType },
      MatchIdentityLocalizationFormat.Long,
    ),
  ).toThrow("No match type");
});
