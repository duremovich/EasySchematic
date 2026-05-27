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

## Useful Runtime Checks

Test live site:

```bash
curl -I https://schematic.tateside.online
```

Test local container on VPS:

```bash
curl -I http://127.0.0.1:8080
```

## Resume Context For Future Chat

If starting a new Codex chat, paste this summary:

```text
We are working on my fork of EasySchematic at C:\Users\seanl\Documents\codex\EasySchematic\repo.
It is deployed on my VPS at https://schematic.tateside.online.
My GitHub fork is https://github.com/seanliamdarcy-code/EasySchematic.
The original upstream is https://github.com/duremovich/EasySchematic.
We added Tateside branding, a Draw Box tool, External Endpoint nodes, and explicit Trackpad navigation mode.
Please read TATESIDE-NOTES.md and inspect git log/status before making changes.
```
