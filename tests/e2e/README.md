# End-to-end tests (collaboration)

Real copies of the app, each logged in as a different person, driven through
the real menus and dialogs against the local dev server.

## Run

Needs the dev Docker stack (`strabo-php`, `strabo-postgres`) with
MICROSYNC_ENABLED. Vite is started automatically if it is not running.

    npm run e2e                 # every scenario
    npm run e2e -- 01-          # scenarios whose file name matches
    npm run e2e:watch           # windows side by side, a caption per step, pauses
    E2E_PAUSE_MS=3000 npm run e2e:watch -- 01-   # slower
    npm run e2e:report          # the last run's report (screens, logs, traces)
    npm run e2e:typecheck

A failed scenario attaches each copy's screen, main.log, any native dialog
the test did not answer, and a trace (`npx playwright show-trace <zip>`:
every step with a screenshot).

## Before each run (globalSetup.ts)

- `seed.sql` creates the e2e accounts if missing (a dev database restored
  from a backup loses them) and resets their password to `testpass123`:
  Ana Ruiz, Ben Ito, Cleo Park, Dev Shah (`e2e.<name>@test.strabospot.org`).
  Nothing else may use these accounts.
- Each account must log in on the server.
- `client_fixture.php wipe-e2e` removes everything the e2e accounts own
  (projects, invitations, memberships, deleted-project tombstones).

## How it works

- `STRABO_E2E_DIR` (development only, electron/main.js) gives each copy its
  own userData and Documents in a temporary folder; under test the sync
  timers are short (src/services/e2eMode.ts) and the stores are reachable as
  `window.__e2e` (src/services/e2eHooks.ts).
- `lib/copy.ts`: launch a copy; click menu items by label; queue answers for
  native dialogs (file pickers, message boxes), unanswered ones are
  cancelled and reported; captions for watch mode; log in through
  Account > Login...
- `lib/actions.ts`: steps as a person does them (open an .smz, turn sync on,
  invite, accept from the header chip, wait until settled).
- `lib/fixtures.ts`: a fresh small project (.smz) per scenario.
