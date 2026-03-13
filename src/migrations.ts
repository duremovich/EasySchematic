/**
 * Schema migrations for EasySchematic save files.
 *
 * Each migration takes a raw JSON object at version N and returns version N+1.
 * Migrations run sequentially from the file's version up to CURRENT_SCHEMA_VERSION.
 *
 * When bumping the schema version (middle number in 0.x.y):
 *   1. Increment CURRENT_SCHEMA_VERSION
 *   2. Add a migration function: migrations[oldVersion] = (data) => { ... return data; }
 *   3. Update package.json version to 0.<new schema version>.0
 */

export const CURRENT_SCHEMA_VERSION = 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Migration = (data: any) => any;

const migrations: Record<number, Migration> = {
  // Example for future use:
  // 1: (data) => {
  //   // Migrate from schema v1 → v2
  //   for (const node of data.nodes ?? []) {
  //     if (node.type === "device") {
  //       // ... transform data ...
  //     }
  //   }
  //   data.version = 2;
  //   return data;
  // },
};

/**
 * Migrate a schematic file from its current version to CURRENT_SCHEMA_VERSION.
 * Returns the migrated data (mutated in place).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateSchematic(data: any): any {
  let version = data.version ?? 1;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      console.warn(
        `No migration for schema version ${version} → ${version + 1}. Skipping.`,
      );
      version++;
      continue;
    }
    data = migrate(data);
    version = data.version;
  }

  return data;
}
