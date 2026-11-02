/**
 * Curated public surface for the EasySchematic developer API reference.
 *
 * TypeDoc reads this file as its entry point and documents whatever's
 * re-exported here. Anything *not* re-exported through this module is
 * treated as internal and stays out of the generated reference.
 *
 * To expose something new in the reference, add it here and rebuild
 * (`npm run docs:dev` regenerates into docs/dist/dev/).
 *
 * Organized by namespace so the generated docs read like a Unity-style
 * Scripting API — `types`, `EdgeRouter`, `PackList`, etc. — rather than a
 * flat dump of every symbol in the repo.
 *
 * @module
 */

// Core types & data model — flat (these are the most cross-referenced symbols).
export * from "./types";

// State & store
export * as Store from "./store";
export * as CloudCache from "./cloudCache";
export * as CloudSync from "./cloudSync";

// Schema migrations (schematic file format)
export * as Migrations from "./migrations";

// Connector / signal / device taxonomies
export * as TypeRegistry from "./typeRegistry";
export * as BuiltinTypeTables from "./builtinTypeTables";
export * as ConnectorTypes from "./connectorTypes";
export * as CableTypes from "./cableTypes";
export * as DeviceTypeCategories from "./deviceTypeCategories";
export * as NodeTypes from "./nodeTypes";
export * as SignalColors from "./signalColors";

// Routing & pathfinding
export * as EdgeRouter from "./edgeRouter";
export * as Pathfinding from "./pathfinding";
export * as WaypointSync from "./waypointSync";
export * as StubPlacement from "./stubPlacement";

// Reports / schedules
export * as PackList from "./packList";
export * as CableSchedule from "./cableSchedule";
export * as NetworkReport from "./networkReport";
export * as PowerReport from "./powerReport";
export * as PatchPanelSchedule from "./patchPanelSchedule";
export * as Thermal from "./thermal";
export * as RackStats from "./rackStats";
export * as InventoryKey from "./inventoryKey";

// Layout & UI utilities
export * as AlignUtils from "./alignUtils";
export * as SnapUtils from "./snapUtils";
export * as GridConstants from "./gridConstants";
export * as PrintPageGrid from "./printPageGrid";
export * as ColorKeyLayout from "./colorKeyLayout";
export * as ReportLayout from "./reportLayout";
export * as TitleBlockLayout from "./titleBlockLayout";
export * as DisplayName from "./displayName";
export * as LabelCaseUtils from "./labelCaseUtils";
export * as RoomDistance from "./roomDistance";
export * as RackUtils from "./rackUtils";
export * as RackLink from "./rackLink";
export * as AuxiliaryData from "./auxiliaryData";

// Validation
export * as NetworkValidation from "./networkValidation";
export * as SanitizeHtml from "./sanitizeHtml";

// Templates (library client + sync)
export * as TemplateApi from "./templateApi";
export * as TemplateSearch from "./templateSearch";
export * as TemplateSync from "./templateSync";
export * as TemplateExport from "./templateExport";

// Import / export
export * as CsvImport from "./csvImport";
export * as ExportUtils from "./exportUtils";
export * as PdfExport from "./pdfExport";
export * as ReportPdf from "./reportPdf";
export * as RackPdf from "./rackPdf";
export * as PrintSheetPdf from "./printSheetPdf";
export * as PrintSheetExport from "./printSheetExport";
export * as PrintConfig from "./printConfig";
export * as PrintSheetAutoFill from "./printSheetAutoFill";
export * as PrintSheetSnap from "./printSheetSnap";
export * as PrintUtils from "./printUtils";
export * as DxfExport from "./dxfExport";
