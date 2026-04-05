export default function ReviewGuidelines() {
  return (
    <details className="mb-6 rounded-lg border border-blue-200 bg-blue-50/50">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-blue-800 hover:bg-blue-50 rounded-lg select-none flex items-center gap-2">
        <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z" /></svg>
        Moderator Review Guidelines
      </summary>
      <div className="px-4 pb-4 text-sm text-slate-700 space-y-4">

        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Device Type</h3>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
            <li>Must be <strong>kebab-case</strong> and match an existing type (e.g., <code className="text-xs bg-slate-100 px-1 rounded">audio-dsp</code>, <code className="text-xs bg-slate-100 px-1 rounded">switcher</code>).</li>
            <li>Many submitted types map to existing ones: crossovers, compressors, delays, and EQs are all <code className="text-xs bg-slate-100 px-1 rounded">audio-dsp</code>. Headphone DAs are <code className="text-xs bg-slate-100 px-1 rounded">headphone-amplifier</code>. Rasterizers/waveform monitors are <code className="text-xs bg-slate-100 px-1 rounded">video-scope</code>.</li>
            <li>If a genuinely new type is needed, use the <strong>Defer</strong> button — new types require a codebase change before approval.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Signal & Connector Types</h3>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
            <li><strong>Avoid accepting <code className="text-xs bg-amber-50 text-amber-700 px-1 rounded">custom</code> signal types or <code className="text-xs bg-amber-50 text-amber-700 px-1 rounded">other</code> connector types</strong> when a specific type exists. Edit the submission to use the correct type.</li>
            <li>If the correct type doesn't exist in the codebase yet, use the <strong>Defer</strong> button — adding new types requires a code change.</li>
            <li>Common mistakes: <code className="text-xs bg-slate-100 px-1 rounded">serial</code> should be <code className="text-xs bg-slate-100 px-1 rounded">rs422</code>, <code className="text-xs bg-slate-100 px-1 rounded">sdi</code> used for analog audio, power connectors set to "other" when <code className="text-xs bg-slate-100 px-1 rounded">iec</code> or <code className="text-xs bg-slate-100 px-1 rounded">barrel</code> is correct.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Reference URL</h3>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
            <li><strong>Always check the reference URL.</strong> Verify it loads, contains specs, and matches the submitted device.</li>
            <li>Prefer the manufacturer's <strong>specifications page</strong> over marketing overviews.</li>
            <li>Replace broken or generic URLs (homepages, marketing pages) with the correct product spec page.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Port Verification</h3>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
            <li>Cross-reference submitted ports against manufacturer specs when possible.</li>
            <li>If a submission has ports you can't verify, try to understand the submitter's intent rather than assuming an error — it may be a <strong>Defer</strong> case rather than a rejection.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-900 mb-1">Virtual Channels (Dante, MADI, AES67)</h3>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
            <li>Physical network ports (RJ45, SFP) keep their real connector type.</li>
            <li>Logical audio channels should use <code className="text-xs bg-slate-100 px-1 rounded">connectorType: "none"</code>.</li>
            <li>Large channel counts (64+) are normal for intercom matrices and commentary systems.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-900 mb-1">When to Defer vs. Reject</h3>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
            <li><strong>Defer</strong> when the submission is correct but needs a codebase change first (new device type, signal type, or connector type).</li>
            <li><strong>Edit & Approve</strong> when fixes are straightforward (wrong device type, missing connector, etc.).</li>
            <li><strong>Reject</strong> when the submission has fundamental accuracy issues (wrong device specs, mixed-up products). Always include a note explaining what's wrong.</li>
          </ul>
        </div>

      </div>
    </details>
  );
}
