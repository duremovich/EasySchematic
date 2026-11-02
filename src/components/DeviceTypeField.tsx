import { allDeviceTypes, deviceTypeCategory, deviceTypeLabel, registeredDeviceType } from "../typeRegistry";
import { useTypeRegistryVersion } from "../hooks/useTypeRegistryVersion";
import { NEW_TYPE_OPTION_LABEL, NEW_TYPE_VALUE, requestNewType } from "../newTypeRequest";

const INPUT =
  "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500";

/**
 * The device editor's Device Type: free text as before, plus a picker over every known
 * device type (built-in, community, yours) ending in "+ New device type…". A community or
 * user type shows as its label, never its id (user ids are `x-…-k3f9`, custom-types P5).
 */
export default function DeviceTypeField({ value, onChange }: {
  value: string;
  /** `category` is the picked type's category, for a caller that fills its own. */
  onChange: (deviceType: string, category?: string) => void;
}) {
  useTypeRegistryVersion();
  const registered = value ? registeredDeviceType(value) : undefined;
  const byCategory: Record<string, string[]> = {};
  for (const id of allDeviceTypes()) (byCategory[deviceTypeCategory(id)] ??= []).push(id);
  const categories = Object.keys(byCategory).sort();
  const pick = (id: string) => onChange(id, deviceTypeCategory(id));

  return (
    <div className="flex items-center gap-1">
      {registered ? (
        <span className={`${INPUT} flex items-center justify-between gap-1`} data-testid="device-type-chip">
          <span className="truncate">{registered.label}</span>
          <button type="button" onClick={() => onChange("")} className="text-[var(--color-text-muted)] hover:text-red-600 cursor-pointer" aria-label="Clear device type">
            ×
          </button>
        </span>
      ) : (
        <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. camera" />
      )}
      <select
        className="w-6 shrink-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded py-1.5 text-xs text-[var(--color-text-heading)] outline-none focus:border-blue-500 cursor-pointer"
        value=""
        title="Pick a device type"
        onChange={(e) => {
          const v = e.target.value;
          if (v === NEW_TYPE_VALUE) requestNewType("device", pick);
          else if (v) pick(v);
        }}
        data-testid="device-type-select"
      >
        <option value="" />
        {categories.map((cat) => (
          <optgroup key={cat} label={cat}>
            {byCategory[cat]
              .sort((a, b) => deviceTypeLabel(a).localeCompare(deviceTypeLabel(b)))
              .map((id) => <option key={id} value={id}>{deviceTypeLabel(id)}</option>)}
          </optgroup>
        ))}
        <option value={NEW_TYPE_VALUE}>{NEW_TYPE_OPTION_LABEL.device}</option>
      </select>
    </div>
  );
}
