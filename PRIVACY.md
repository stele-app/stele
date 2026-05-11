# Stele Privacy Policy

_Last updated: 2026-05-11_

Stele is a local-first, open-source desktop application. It is designed to handle your data on your own device, without accounts, servers, or tracking.

## What Stele collects

**Nothing.** Stele does not collect, transmit, store, or share any personal data, usage analytics, telemetry, crash reports, or diagnostics with its developers or any third party. No account is required to use Stele.

## What Stele stores locally

Stele stores the following data **only on your own device**, in a local SQLite database inside your operating system's per-application data folder:

- **Imported artifacts** — the source files (`.jsx`, `.tsx`, `.html`, `.svg`, `.md`, `.mermaid`) that you explicitly import into Stele, along with their filenames, timestamps, tags, and thumbnails.
- **Capability grants** — which permissions you have granted to which artifacts (e.g., "artifact X is allowed to use the camera").
- **Artifact-scoped key/value storage** — if a running artifact calls `window.storage`, its data is persisted locally and is scoped to that artifact.
- **Watched folders** — any folder paths you have asked Stele to monitor for new artifact files.

This data never leaves your device unless you explicitly export or share it.

## Web viewer: optional sharing

The web viewer at stele.au has a "Share link" button. For artifacts opened from a URL, this just copies that URL — nothing is uploaded. For artifacts opened from a local file or generated in your browser, clicking Share **uploads the artifact source to a Stele-operated endpoint** so the recipient of the link can open it. Uploads are anonymous, retained for **24 hours**, then permanently deleted. Anyone with the link can read the artifact source during that window.

The desktop app does not upload anything when you share.

## What artifacts you run can do

Artifacts run inside a sandboxed `<iframe>` that cannot access your files, cookies, Stele's database, or other artifacts' data. A running artifact can only take actions you have explicitly granted it via its manifest:

- `geolocation` — access your device location
- `camera` / `microphone` — access your camera or microphone
- `clipboard-read` / `clipboard-write` — read or write your clipboard
- `network: <host>` — make network requests to a specific declared host

If an artifact is granted `network:` capability, it can send data to the declared external host when you use it. **That traffic goes from your device directly to the host chosen by the artifact author, not through Stele or any Stele-operated server.** You are consenting to that communication when you grant the capability; Stele does not observe, intercept, or store the contents of those requests.

You can review and revoke any artifact's granted capabilities at any time in **Settings → Permissions**.

## Third parties

Stele itself does not integrate with any third-party analytics, advertising, or data-collection service.

Stele's distribution involves third parties whose own privacy policies apply:
- **GitHub** hosts the source code and installer downloads.
- **SignPath Foundation / SignPath.io** provides Authenticode code signing for Windows installers.

Stele does not send any data to these parties beyond what is inherent to downloading an open-source release (i.e., GitHub sees your request when you download the installer).

## Children's data

Stele is not targeted at children and does not knowingly collect data from anyone, including children, because it does not collect data.

## Changes to this policy

If Stele's data practices ever change, this policy will be updated and the date at the top of the page revised. For the current version, always refer to the copy at [github.com/stele-app/stele/blob/main/PRIVACY.md](https://github.com/stele-app/stele/blob/main/PRIVACY.md).

## Contact

For privacy questions, open an issue at [github.com/stele-app/stele/issues](https://github.com/stele-app/stele/issues) or email the maintainer via the contact listed on the repository.
