# Playwright TypeScript Test Automation Framework

A UI test automation framework built with Playwright and TypeScript, targeting [Practice Test Automation](https://practicetestautomation.com). Implements the Page Object Model pattern with a fully custom HTML reporter.

---

## Tech Stack

| Tool | Version |
|---|---|
| Playwright | 1.58.2 |
| TypeScript | 5.9.3 |
| Node.js | 18+ |
| dotenv | 17.3.1 |

---

## Project Structure

```
pwright-typescript/
├── src/
│   ├── fixtures/
│   │   └── baseTest.ts          # Custom test fixtures (loginPage, homePage)
│   ├── pages/
│   │   ├── LoginPage.ts         # Login page object
│   │   └── HomePage.ts          # Home page object
│   ├── reporter/
│   │   └── customHtmlReporter.ts  # Custom HTML reporter
│   └── utils/
│       └── env.ts               # Environment variable helpers
├── tests/
│   └── ui/
│       ├── login.spec.ts        # Login tests
│       └── homepage.spec.ts     # Homepage tests
├── custom-report/               # Generated HTML reports (gitignored)
├── .env                         # Environment variables (gitignored)
├── playwright.config.ts         # Playwright configuration
└── tsconfig.json                # TypeScript configuration
```

---

## Setup

```bash
npm install
npx playwright install
```

Create a `.env` file in the project root:

```env
BASE_URL=https://practicetestautomation.com
USERNAME=your_username
PASSWORD=your_password
```

---

## Running Tests

```bash
# Run all tests (headless)
npm test

# Run with browser UI visible
npm run test:headed

# Run only in Chrome
npm run test:chrome

# Type check without running tests
npm run type-check
```

---

## Browsers

Tests run on **Chromium** and **Firefox** by default. **WebKit** is conditionally included — it is skipped on Apple Silicon (M1/M2) running macOS Monterey or earlier due to Playwright compatibility.

---

## Custom HTML Reporter

Each test run generates a self-contained HTML report in `custom-report/` with a timestamp in the filename (e.g. `index-2026-03-15_14-30-00.html`). Reports are never overwritten.

### Report Features

- Summary cards with per-browser pass/fail/skip counts
- Progress bar with percentage labels
- Environment info (base URL, Node.js version, platform, browsers)
- Slowest tests (top 5) with relative time bars
- Flaky test detection (retried tests that eventually passed)
- Results by browser with per-spec breakdown
- Per-browser tabs with search/filter, Expand All, Collapse All, Jump to Failure
- Collapsible suite → status group → test card hierarchy
- Failed suites auto-expand on load
- Error details with copy button and stack trace
- Failure screenshots embedded as base64
- Step-by-step execution log
- Dark mode toggle

To open the latest report:

```bash
npm run report
```

---

## Page Objects

### LoginPage (`src/pages/LoginPage.ts`)

| Method | Description |
|---|---|
| `goto()` | Navigate to `/practice-test-login/` |
| `login(username, password)` | Fill credentials and submit |
| `verifyLoginSuccess()` | Assert success message is visible |
| `verifyLoginFailure(message)` | Assert error message text |

### HomePage (`src/pages/HomePage.ts`)

| Method | Description |
|---|---|
| `goto()` | Navigate to `/` |
| `verifyHeadingVisible()` | Assert h1 is visible |
| `verifyTitle(expected)` | Assert page title |
| `verifyNavLinksExist()` | Assert navigation links exist |
| `verifyPracticeLinkVisible()` | Assert practice link is visible |

---

## Adding New Tests

1. Create a page object in `src/pages/`
2. Register it as a fixture in `src/fixtures/baseTest.ts`
3. Write your spec in `tests/ui/`

```ts
// tests/ui/example.spec.ts
import { test, expect } from '../../src/fixtures/baseTest';

test('my test', async ({ page }) => {
  // ...
});
```

---

## CI/CD

A GitHub Actions workflow (`.github/workflows/playwright.yml`) is included for running tests on push/pull request.
