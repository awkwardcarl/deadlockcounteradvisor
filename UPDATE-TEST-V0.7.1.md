# v0.7.1 — automatic-update verification release

This release is intentionally minimal. The recommendation engine, data collection limitations, Overwolf approval status, and second-monitor layout are unchanged. The visible footer now reads `v0.7.1 · Update-channel verification`.

## Prepare v0.7.1 in GitHub Desktop

1. Leave your installed v0.7.0 application in place. **Do not edit/delete tag v0.7.0 or its published release.**
2. Copy only the four files from the v0.7.1 patch into their matching paths at the GitHub repository root (not a nested folder).
3. In GitHub Desktop, check `package.json`, `index.html`, `tests/release-tests.cjs`, and `tests/updater-tests.cjs` appear under Changes.
4. Commit `Prepare v0.7.1 update verification release` and **Push origin** on main.
5. Confirm Source checks are green.
6. In GitHub Desktop History, create tag **v0.7.1** on this *new* commit; push tag to origin (if not automatically uploaded). Do not reuse the 0.7.0 tag.
7. On GitHub Actions, a tagged Windows installer and release run should start. Wait for success.
8. Review the **v0.7.1 draft release** and verify the setup EXE, `.exe.blockmap`, and `latest.yml` exist. Ensure the release is **not** marked as a prerelease (the updater ignores prereleases). Publish the draft **only after reviewing** the assets.

## Verify the end-to-end updater

1. **Do not manually install v0.7.1**. Leave your working **installed v0.7.0** application in place for this test.
2. Once the v0.7.1 GitHub Release is published, open v0.7.0 and use **Check updates**, or restart it and allow its startup check.
3. It should offer **v0.7.1**. Approve download, wait for **Install & restart**, and only then approve installation **while out of any match**.
4. After restart, verify the bottom of the application reads **v0.7.1 · Update-channel verification**. Also ensure heroes/items, input state, second-monitor position and text size are okay.
5. If update check or installation fails, capture the exact in-app error and/or Windows updater log. Do not manually remove 0.7.0 until we understand the cause.

**Cautions:** This is still an unsigned beta and remains a public release. This patch does not connect to Deadlock telemetry; approved Overwolf live feed is pending. GitHub Actions is configured to build the installer, but we cannot test Windows installation in this environment. Code signing is still recommended before broad distribution.
