# SE Programmable Block API — codegen reference notes

Working notes on the public Space Engineers Programmable Block ModAPI, gathered while implementing the `ExtendedBuiltin` node emitters in `src/lib/codegen/extendedEmitters.ts`. This is our own summary of publicly documented interface members (the kind of factual signature information any programmer would note while reading API docs) — not a copy of Keen's XML doc text or of the original Scriptilyx SE app's source, which is never read into this repo. See `CLAUDE.md` → "Hard constraints" for why that distinction matters here.

Sources: the XML doc comments shipped with the game itself (`Bin64/*.xml` next to `Sandbox.Common.dll`, `SpaceEngineers.Game.dll`, `VRage.Game.dll` — these ship publicly with every install as the ModAPI reference for scripters/modders), cross-checked against https://malforge.github.io/spaceengineers/pbapi/ and https://keensoftwarehouse.github.io/SpaceEngineersModAPI/. Namespaces below are all under `Sandbox.ModAPI.Ingame` / `VRage.Game.ModAPI.Ingame` / `SpaceEngineers.Game.ModAPI.Ingame` unless noted; the in-game scripting sandbox only allows the `Ingame` variant of each interface.

## Generic terminal block API (works on any `IMyTerminalBlock`)

- `Enabled` (`IMyFunctionalBlock`), `IsWorking`, `IsFunctional` (base `IMyCubeBlock`/`IMyTerminalBlock`).
- `CustomName`, `CustomData`, `DetailedInfo` (get/set free-text fields).
- `GetValue<T>(id)` / `SetValue<T>(id, value)` — generic terminal property access by string id, `T` ∈ `bool`, `float`, `long`, `Color`, `StringBuilder`. Works for *any* block's GUI-exposed properties, including newer blocks (AI Blocks, Event Controller, Action Relay) that don't have a bespoke strongly-typed interface in this game version.
- `ApplyAction(actionId)` — invoke a terminal action (toolbar button) by id.
- `GetActions(list)`, `GetActionWithName(name)`, `SearchActionsOfName(...)` — enumerate `ITerminalAction { Id, Name, Icon }`.
- `GetProperties(list)`, `GetProperty(id)` — enumerate `ITerminalProperty { Id, TypeName }`.
- `IMyBlockGroup.GetBlocks(list)` — expand a named group to its blocks.

## Per-block interfaces used by name (confirmed real members)

- **`IMyMotorStator`** (rotors *and* hinges — same interface): `Angle` (radians), `TargetVelocityRPM`, `Torque`, `BrakingTorque`, `LowerLimitDeg`/`UpperLimitDeg` (yes, real compile-time degree properties, not just the `Rad` variants), `Displacement`, `RotorLock`, `Attach()`, `Detach()`.
- **`IMyPistonBase`**: `Velocity`, `CurrentPosition`, `MinLimit`/`MaxLimit`, `LowestPosition`/`HighestPosition`, `Extend()`, `Retract()`.
- **`IMyDoor`**: `OpenDoor()`, `CloseDoor()`, `Status`, `OpenRatio`.
- **`SpaceEngineers.Game.ModAPI.Ingame.IMyParachute`**: same door-style `Status`/`OpenRatio`/`OpenDoor()`/`CloseDoor()` shape as `IMyDoor`, plus `AutoDeploy`, `AutoDeployHeight`.
- **`SpaceEngineers.Game.ModAPI.Ingame.IMyLandingGear`**: `IsLocked`, `AutoLock`, `LockMode`, `GetAttachedEntity()`. No direct "ready to lock" boolean is exposed by the scripting API — the in-game HUD text is not scriptable, so `ext.gear.if_ready` approximates it as "not locked, but something is in range" and is flagged as best-effort.
- **`IMyJumpDrive`**: `Status` (`MyJumpDriveStatus`: Charging/Ready/Jumping), `CurrentStoredPower`/`MaxStoredPower`, `JumpDistanceRatio` (0–1), `JumpDistanceMeters`.
- **`IMyGasTank`**: `Stockpile`, `FilledRatio` (0–1), `Capacity`.
- **`SpaceEngineers.Game.ModAPI.Ingame.IMyAirVent`**: `Depressurize`, `GetOxygenLevel()` (0–1), `Status`.
- **`IMyBatteryBlock`**: `CurrentStoredPower`/`MaxStoredPower`.
- **`IMyShipConnector`**: `IsConnected`, `Status` (`MyShipConnectorStatus`: Unconnected/Connectable/Connected), `Connect()`, `Disconnect()`.
- **`IMyRadioAntenna`**: `Radius`, `EnableBroadcasting`, `IsBroadcasting` (`CustomName` for rename, inherited from `IMyTerminalBlock`).
- **`IMyBeacon`**: `Radius` (rename via inherited `CustomName`).
- **`IMyProjector`**: `IsProjecting`, `RemainingBlocks`, `TotalBlocks`, `BuildableBlocksCount`.
- **`IMyCameraBlock`**: `EnableRaycast`, `CanScan(distance)`, `Raycast(distance, pitch, yaw)` → `MyDetectedEntityInfo { EntityId, Name, Type (MyDetectedEntityType), HitPosition, Position }`; an empty result has `EntityId == 0`.
- **`IMySensorBlock`**: `IsActive`, `DetectedEntities(list)`.
- **`IMyTimerBlock`**: `IsCountingDown`, `TriggerDelay` (seconds), `Trigger()`, `StartCountdown()`, `StopCountdown()`.
- **`IMyConveyorSorter`**: `DrainAll`, `Mode` (`MyConveyorSorterMode`: Whitelist/Blacklist), `GetFilterList(list)`, `AddItem(filter)`, `RemoveItem(filter)`, `IsAllowed(MyDefinitionId)`, `SetFilter(mode, list)` — all real, scriptable. Item ids are `MyDefinitionId` built from a type/subtype pair, e.g. `MyDefinitionId.Parse("MyObjectBuilder_Ore/Iron")` (matches the `ConveyorSorterItems.json` `TypeId/SubtypeId` shape already shipped).
- **`IMyShipController`** (base of `IMyCockpit`/`IMyRemoteControl`): `GetNaturalGravity()`, `GetArtificialGravity()` (both `Vector3D`, use `.Length()` for magnitude), `GetShipSpeed()`, `CalculateShipMass()` (`MyShipMass.PhysicalMass`), `MoveIndicator` (`Vector3`), `RotationIndicator` (`Vector2`: X=pitch, Y=yaw), `RollIndicator`, `HandBrake`, `IsUnderControl`, `TryGetPlanetElevation(MyPlanetElevation, out double)`.
- **`IMyProgrammableBlock`**: `TryRun(argument)`.
- **`IMyIntergridCommunicationSystem`** (`IGC` on `MyGridProgram`): not used by any current node — the "Action Relay" nodes below turned out to map to a real named block, not IGC messaging.

## "Action Relay" and "Broadcast Controller"

Both are real SE blocks not present in the ModAPI docs bundled with the installed game version (introduced later than that XML), but the intended shape is fully specified by our own `NodeLibrary.json`'s `Description` fields (which we already ship, credited, as reusable data) — no need to guess:

- **Action Relay**: has terminal properties `Channel` (float/`Single`) and `ReceiveFrom` (`long` enum: Owner/Faction/Everyone), and a terminal *action* whose id contains "Send" (found at runtime via `GetActions()`/`GetActionWithName`, matched by substring, since the exact id isn't documented anywhere we can reach). All accessed through the generic `GetValue<T>`/`SetValue<T>`/`GetActions` API above — this is not a fallback for this block, it's the correct approach.
- **Broadcast Controller**: exposes 8 message slots as terminal string properties named `Message0`..`Message7` (per our node spec: "Scriptilyx automatically maps the selected slot to Space Engineers Message0-Message7"), plus terminal actions for "trigger message N", "send random", and "send GPS" — looked up by name the same way as Action Relay's Send action.

## Not implemented / left as an honest no-op

- Conveyor sorter item filter *editing UI parity* beyond what `AddItem`/`RemoveItem`/`SetFilter`/`IsAllowed` support is out of scope; those four methods cover the whole feature, so nothing is stubbed here anymore.
- Nothing else — this pass implements every remaining `ExtendedBuiltin` node. Anything genuinely uncertain (landing gear "ready to lock", the Action Relay/Broadcast Controller action-name lookups) is implemented as documented best-effort above rather than skipped, with the caveat noted in this file and in a source comment at the call site.
