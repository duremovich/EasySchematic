# Tateside EasySchematic Notes

This fork is Sean Darcy's custom version of EasySchematic for Tateside use.

## Project Links

- Live instance: https://schematic.tateside.online
- GitHub fork: https://github.com/seanliamdarcy-code/EasySchematic
- Upstream project: https://github.com/duremovich/EasySchematic
- VPS repo path: `~/EasySchematic`
- Local workspace: `C:\Users\seanl\Documents\codex\EasySchematic\repo`

## Git Remotes

- `origin` points to the Tateside fork.
- `upstream` points to the original EasySchematic project.

Normal custom-change flow:

```bash
git add .
git commit -m "Describe change"
git push origin master
```

Pull upstream EasySchematic updates into the fork:

```bash
git fetch upstream
git checkout master
git merge upstream/master
git push origin master
```

## VPS Deploy

From the VPS:

```bash
cd ~/EasySchematic
git pull
docker compose up -d --build
```

Check the container:

```bash
docker compose ps
docker compose logs --tail=100
```

Caddy proxies `schematic.tateside.online` to `127.0.0.1:8080`.

Current Docker port binding should stay localhost-only:

```yaml
ports:
  - "127.0.0.1:8080:80"
```

Check Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 100 --no-pager
```

## Custom Changes

### Branding

Commit: `304b3c5` - `Brand app as Tateside Schematic`

- Browser title changed to `Tateside Schematic`.
- Top-left app label changed to `Tateside Schematic`.
- About dialog label changed to `Tateside Schematic`.

### Draw Box Tool

Commits:

- `e032728` - `Add visual draw box grouping tool`
- `55ed0b6` - `Refine draw box layout and layering`
- `0e1bfec` - `Ignore draw boxes in spacing enforcement`

Intent:

- `Room` remains a semantic container.
- `Draw Box` is purely visual and must not affect room names, stub labels, reports, or device parentage.

Current behavior:

- `Draw Box` appears below `Room` in the left device/library panel.
- Quick-add search can create a draw box.
- Draw boxes are annotation nodes with `role: "draw-box"`.
- Draw boxes render behind devices.
- Draw-box labels render top-left.
- Draw boxes are ignored by minimum-spacing collision enforcement, so devices can sit inside them.
- Dashed draw-box outlines are preserved in DXF export.

### External Endpoint Nodes

Commits:

- `0cec79e` - `Add external endpoint nodes`
- `3fad819` - `Refine external endpoint labels`
- `2dd00b5` - `Fix external endpoint direction matching`
- `ff0bbd1` - `Add external endpoint colour controls`

Intent:

- External endpoints represent the device or system on the far end of a connection, such as a client network, an off-page handoff, or a stub-style external device.
- They are useful for keeping drawings clean without needing to place a full device block for the far end.

Current behavior:

- External Endpoint appears in the device library and quick-add search.
- The endpoint can be renamed from External Endpoint Properties.
- Endpoint direction, signal type, and connector type can be edited from properties.
- Endpoint fill color and text color can be edited from properties.
- Direction matching follows AV logic: a block output connects to the external endpoint input, and a block input connects to the external endpoint output.
- Bidirectional external endpoints expose separate `-in` and `-out` sides so the connection direction is unambiguous.

### Trackpad Navigation

Commit: `6486105` - `Add explicit trackpad navigation mode`

Intent:

- Trackpad users should be able to pan naturally with two fingers and zoom only by pinching, without first moving sideways to trigger detection.
- Hardware input choice is a user/browser preference, not part of the saved schematic drawing data.

Current behavior:

- `Edit > Preferences > Canvas > Navigation input` offers `Automatic`, `Mouse wheel`, and `Trackpad`.
- In `Trackpad` mode, two-finger movement pans the schematic immediately in both axes, including pure vertical movement from the first event.
- In `Trackpad` mode, opening or closing two fingers still pinch-zooms around the pointer position.
- The same trackpad mode is applied to print sheet navigation.
- `Automatic` retains the existing detection behavior for users who do not select a device mode.
- Confirmed locally on the Tateside setup that `Trackpad` mode works as intended.

### Cable Move Preservation

Commit: `e663a14` - `Refine BLU cable nudge preservation`

Intent:

- Moving a device should preserve the cable geometry users intentionally shaped, while letting ordinary auto-routed links redraw cleanly.
- Mouse drag and arrow-key nudges should behave the same way.

Current behavior:

- Manual multi-point cable routes keep their preserved shape when a connected device moves.
- Single-anchor manual cables are treated carefully so the stationary endpoint stays pinned to its real handle row.
- Arrow-key nudges now reuse the same move logic as mouse dragging instead of following React Flow's built-in keyboard movement.
- The BLU-100 nudge case is tuned so the nearby amp outputs straighten while the BSS inputs and the lower amp feed remain stable.

### Recent Commit Notes

Recent commits on `master` are:

- `6a20a5d` - `Document BLU cable nudge behavior`
- `e663a14` - `Refine BLU cable nudge preservation`
- `768c87f` - `Stabilize tight selection edge moves`
- `e457efc` - `Preserve group move edge routing`
- `3406a82` - `Widen draw box resize handles`
- `0fedc69` - `Fix draw box reload snapping`
- `e64d298` - `Open cable ID editor on ctrl-click`
- `06f5a5a` - `Add double-click cable handle insertion`

These are all present in both the local repo and the pushed `origin/master` branch.

## Useful Runtime Checks

Test live site:

```bash
curl -I https://schematic.tateside.online
```

Test local container on VPS:

```bash
curl -I http://127.0.0.1:8080
```

## Private Access Setup

Completed on `2026-05-29`.

Goal achieved:

- `schematic.tateside.online` is now private behind Microsoft login.
- Public direct access to the VPS for the schematic app has been removed from the live hostname path.
- Traffic now reaches the app through Cloudflare Tunnel instead of the old direct `A` record.

Current live access architecture:

- DNS for `tateside.online` is managed in Cloudflare.
- `schematic.tateside.online` is routed through a Cloudflare Tunnel named `tateside-schematic`.
- Tunnel origin target is `http://127.0.0.1:8080`.
- Cloudflare Access protects `schematic.tateside.online`.
- Identity provider is Microsoft Entra ID / Azure AD.
- Access policy currently allows users with emails ending in `@tateside.com`.
- Session duration is set to `24 hours`.

Key external setup details:

- Cloudflare Zero Trust team domain: `tateside.cloudflareaccess.com`
- Entra app registration name: `Cloudflare Zero Trust Access`
- Entra redirect URI:

```text
https://tateside.cloudflareaccess.com/cdn-cgi/access/callback
```

Important deployment notes:

- The old direct Cloudflare DNS `A` record for `schematic.tateside.online -> 37.59.122.48` was removed during cutover so the live host could not bypass Access.
- A temporary test hostname `schematic-test.tateside.online` was used during tunnel testing.
- If login starts redirecting to the wrong host again, check the Cloudflare Access application destinations and make sure only the intended live hostname is present.
- When the test hostname was left in the Access app, post-login redirects could incorrectly return users to `schematic-test.tateside.online`.

VPS tunnel install notes:

- Server access used:

```bash
ssh debian@37.59.122.48
```

- `cloudflared` was installed from Cloudflare's Debian repository.
- Tunnel service was installed with:

```bash
sudo cloudflared service install <token>
```

- Tunnel service check:

```bash
sudo systemctl status cloudflared --no-pager
sudo journalctl -u cloudflared -n 100 --no-pager
```

Origin verification that passed during setup:

```bash
curl -I http://127.0.0.1:8080
curl -I -H "Host: schematic.tateside.online" http://127.0.0.1:8080
```

Next likely work:

- Replace EasySchematic cloud save/login flows with Microsoft/SharePoint save and open.
- Build a TateSide-owned shared device library. Since the app is private to TateSide staff, direct staff additions are preferred over a public review queue.
- Later decide whether to keep or remove any spare test tunnel hostname once no longer needed.

## App Login And Cloud UI Removal

Completed on `2026-05-31`.

Intent:

- Cloudflare Access is now responsible for site-level authentication.
- The app should no longer show or rely on EasySchematic's original login, community submission, or cloud-save UI.
- Future save/open work should target TateSide-owned Microsoft 365/SharePoint storage rather than the upstream EasySchematic cloud API.

Current behavior:

- The old EasySchematic login/user menu has been removed from the top bar and mobile menu.
- `File > Save to Cloud` and `File > My Schematics...` have been removed.
- Device editor no longer shows `Submit to Community`.
- The pending community-submission banner has been removed.
- New schematics start from the local blank/default state rather than attempting to fetch a cloud template for logged-in users.
- Local file save/open behavior remains in place.

Verification:

```bash
npm run build
npm test
```

Both passed locally on `2026-05-31`.

Local dev server note:

- If Codex-launched hidden Vite processes appear to start but the browser says the site cannot be reached, start Vite in a persistent visible PowerShell window instead:

```powershell
cd C:\Users\seanl\Documents\codex\EasySchematic\repo
npm run dev -- --host 127.0.0.1 --port 5173
```

- Then open:

```text
http://127.0.0.1:5173/
```

- During setup, hidden/sandboxed Codex launches printed Vite "ready" but the Node process exited, so no server was listening. The app build and tests were still healthy.

## Next Phase Direction

Target outcome:

- TateSide owns its own shared device database.
- Staff can use the protected TateSide app without upstream EasySchematic login.
- Staff can add devices directly into the TateSide shared library.
- Users can browse SharePoint project folders and save schematic JSON plus exported files into the chosen project folder.

Likely architecture:

- Keep Cloudflare Access + Microsoft Entra as the front-door login for the whole app.
- Add a small TateSide API layer for privileged Microsoft Graph operations rather than calling Graph directly from browser-only code with broad permissions.
- Use Microsoft Graph for SharePoint folder browsing, file save, file open, and exports.
- Store the shared device library either as versioned JSON in SharePoint initially, or in a small backend database if approval workflow, locking, and richer search become important.
- Keep local JSON save/open as a fallback while SharePoint integration is built.

Important design questions for the next phase:

- Which SharePoint site/library should schematics live in?
- Decision on `2026-05-31`: every TateSide staff user can add devices directly. No separate device admin/review portal is needed for the initial TateSide-only workflow.
- Should device records include commercial fields such as cost, supplier, rack units, power draw, heat, PoE, and support links?
- Should saved projects contain only `.json`, or also exports such as PDF, PNG, DXF, cable schedules, and device reports?
- Should SharePoint folder access simply follow each user's existing Microsoft 365 permissions?

First implementation slice started on `2026-05-31`:

- Added a TateSide-specific browser API client in `src/tatesideApi.ts`.
- Device library loading now tries the TateSide shared device endpoint first, then falls back to the existing bundled/upstream template source while the TateSide API is being built.
- Bulk device import now saves directly to the TateSide shared device library endpoint instead of using any EasySchematic community/review flow.
- Added `File > SharePoint Projects...` as the first SharePoint workflow surface for browsing folders, opening schematic JSON, and saving the current schematic JSON into the selected folder.

Frontend API contract introduced:

```text
GET  /api/tateside/devices/templates
POST /api/tateside/devices/templates
GET  /api/tateside/sharepoint/children?folderId=<optional>
PUT  /api/tateside/sharepoint/schematics
GET  /api/tateside/sharepoint/schematics/:fileId
```

The front end also supports `VITE_TATESIDE_API_URL` if the TateSide API is hosted on a different origin. Default is same-origin `/api/tateside`.

Device database direction:

- Use a TateSide API on the VPS with a small database, likely SQLite initially.
- Keep SharePoint for project schematic JSON and generated exports, not as the primary device database.
- A separate `devices.schematic.tateside.online` portal is not needed for the initial workflow.

VPS API implementation started:

- Added `tateside-api/` as a small Node service using built-in `node:sqlite`.
- Added SQL migration `tateside-api/migrations/0001_device_library.sql`.
- Added local commands:

```bash
npm run tateside:api:build
npm run tateside:api
```

- Default VPS database path should be `/var/lib/tateside-schematic/tateside.db`.
- API should bind to `127.0.0.1:8788` and be routed by the existing web stack/tunnel at `/api/tateside/*`.
- When deployed behind Cloudflare Access, set `TATESIDE_REQUIRE_ACCESS_IDENTITY=1` so writes require `Cf-Access-Authenticated-User-Email`.

## Resume Context For Future Chat

If starting a new Codex chat, paste this summary:

```text
We are working on my fork of EasySchematic at C:\Users\seanl\Documents\codex\EasySchematic\repo.
It is deployed on my VPS at https://schematic.tateside.online.
My GitHub fork is https://github.com/seanliamdarcy-code/EasySchematic.
The original upstream is https://github.com/duremovich/EasySchematic.
We added Tateside branding, a Draw Box tool, External Endpoint nodes, and explicit Trackpad navigation mode.
The live schematic site is now private behind Cloudflare Access + Microsoft Entra login via a Cloudflare Tunnel to http://127.0.0.1:8080.
The old EasySchematic in-app login/cloud/community UI has been removed because Cloudflare Access now protects the whole app.
Next phase is a TateSide-owned device database and Microsoft 365/SharePoint save/open/export workflow.
Please read the Private Access Setup section in TATESIDE-NOTES.md before changing hosting/authentication.
Please read TATESIDE-NOTES.md and inspect git log/status before making changes.
```
