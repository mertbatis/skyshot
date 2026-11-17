# JetBrains tools used

**WebStorm 2026.3** is the IDE for this project. The committed `.idea/` folder holds the project model and the inspection profile.

- **Code inspections.** The project's inspection profile (`.idea/inspectionProfiles/Project_Default.xml`) ran across every file with WebStorm's headless inspector (`inspect.bat`). Fixes that came out of it:
  - `board.html` assigned a number to `textContent` (*JSValidateTypes*); it now goes through `String()`.
  - The CSS classes reported as unused (*CssUnusedSymbol*) were checked one by one. All of them are added at runtime from JavaScript (`playing`, `del`, `ok`, `new`, `r`, `n`, `empty`), so they stay.
  - *JSUnresolvedReference* in `test/bot.mjs` and `serve.mjs` were Node globals in dev-only scripts, outside the shipped game.
  - Grammar inspections (Grazie) caught British spellings in the docs.
- **Formatter.** WebStorm's formatter (`format.bat`) runs over `src/`, `test/` and the HTML entry points.
- **Run configurations.** The unit tests run with Node's test runner (`npm test`) from the IDE.

The game itself has no build step and no dependencies. The repository is exactly what the booth machine runs.
