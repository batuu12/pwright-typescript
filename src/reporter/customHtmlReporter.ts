import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface TestRecord {
  title: string;
  suite: string;
  browser: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  retry: number;
  error?: { message: string; stack?: string };
  steps: { title: string; duration: number; status: 'passed' | 'failed' }[];
  logs: string[];
  screenshot?: string;
  startTime: Date;
}

class CustomHtmlReporter implements Reporter {
  private records: TestRecord[] = [];
  private outputFile: string;
  private startTime: Date = new Date();
  private baseURL: string = '';
  private nodeVersion: string = process.version;

  constructor(options: { outputFile?: string } = {}) {
    this.outputFile = options.outputFile ?? 'custom-report/index.html';
  }

  onBegin(config: FullConfig, _suite: Suite) {
    this.startTime = new Date();
    this.baseURL = config.projects[0]?.use?.baseURL ?? '';

    const ts = this.startTime.toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '');
    const dir = path.dirname(this.outputFile);
    const base = path.basename(this.outputFile, '.html');
    this.outputFile = path.join(dir, `${base}-${ts}.html`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const steps: TestRecord['steps'] = [];
    const logs: string[] = [];

    const collectSteps = (stepList: TestStep[]) => {
      for (const step of stepList) {
        if (step.category === 'test.step' || step.category === 'pw:api') {
          steps.push({
            title: step.title,
            duration: step.duration,
            status: step.error ? 'failed' : 'passed',
          });
        }
        if (step.steps?.length) collectSteps(step.steps);
      }
    };
    collectSteps(result.steps);

    for (const entry of result.stdout) logs.push(`[stdout] ${entry.toString().trim()}`);
    for (const entry of result.stderr) logs.push(`[stderr] ${entry.toString().trim()}`);

    let screenshot: string | undefined;
    const screenshotAttachment = result.attachments.find(
      a => a.name === 'screenshot' && a.contentType === 'image/png'
    );
    if (screenshotAttachment?.path && fs.existsSync(screenshotAttachment.path)) {
      screenshot = fs.readFileSync(screenshotAttachment.path).toString('base64');
    }

    const titlePath = test.titlePath();
    const filePart = titlePath[1] ? path.basename(titlePath[1]) : 'Root';
    const describeParts = titlePath.slice(2, -1);
    const suite = describeParts.length ? `${filePart} > ${describeParts.join(' > ')}` : filePart;
    const browser = test.parent?.project()?.name ?? 'unknown';

    this.records.push({
      title: test.title,
      suite,
      browser,
      status: result.status as TestRecord['status'],
      duration: result.duration,
      retry: result.retry,
      error: result.error
        ? { message: result.error.message ?? '', stack: result.error.stack }
        : undefined,
      steps,
      logs,
      screenshot,
      startTime: result.startTime,
    });
  }

  onEnd() {
    const dir = path.dirname(this.outputFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const duration = ((Date.now() - this.startTime.getTime()) / 1000).toFixed(1);
    const total    = this.records.length;

    const browsers   = [...new Set(this.records.map(r => r.browser))].sort();
    const uiBrowsers = browsers.filter(b => b !== 'api');
    const apiRecords = this.records.filter(r => r.browser === 'api');
    const uiRecords  = this.records.filter(r => r.browser !== 'api');

    const browserIcons: Record<string, string> = {
      chromium: '🟡',
      firefox:  '🦊',
      webkit:   '🔵',
    };

    let cardIndex = 0;
    const renderTestCard = (r: TestRecord) => {
      const id = `test-${cardIndex++}`;

      const retryBadge = r.retry > 0
        ? `<span class="retry-badge">↺ retry ${r.retry}</span>` : '';

      const stepsHtml = r.steps.length
        ? `<ul class="steps">${r.steps.map(s =>
            `<li class="step step-${s.status}">
              <span class="step-icon">${s.status === 'passed' ? '✓' : '✗'}</span>
              <span class="step-title">${escapeHtml(s.title)}</span>
              <span class="step-duration">${s.duration}ms</span>
            </li>`).join('')}</ul>`
        : '<p class="no-data">No steps recorded.</p>';

      const logsHtml = r.logs.length
        ? `<pre class="logs">${r.logs.map(escapeHtml).join('\n')}</pre>`
        : '<p class="no-data">No logs recorded.</p>';

      const errorHtml = r.error ? `
        <div class="error-box">
          <div class="error-box-header">
            <div class="error-title">✗ Error</div>
            <button class="copy-btn" onclick="copyError(this)" data-error="${escapeHtml(r.error.message)}">Copy</button>
          </div>
          <pre class="error-message">${escapeHtml(r.error.message)}</pre>
          ${r.error.stack ? `
          <details class="error-stack-details">
            <summary>Stack Trace</summary>
            <pre class="error-stack">${escapeHtml(r.error.stack)}</pre>
          </details>` : ''}
        </div>` : '';

      const screenshotHtml = r.screenshot ? `
        <div class="section">
          <h4>Screenshot</h4>
          <img class="screenshot" src="data:image/png;base64,${r.screenshot}" alt="failure screenshot" />
        </div>` : '';

      return `
      <div class="test-card" id="${id}" data-title="${escapeHtml(r.title.toLowerCase())}" data-status="${r.status}">
        <button class="test-header" onclick="toggle('${id}')">
          <span class="status-badge status-${r.status}">${r.status.toUpperCase()}</span>
          ${retryBadge}
          <span class="test-title">${escapeHtml(r.title)}</span>
          <span class="test-meta">
            <span class="duration">${(r.duration / 1000).toFixed(2)}s</span>
          </span>
          <span class="chevron">▾</span>
        </button>
        <div class="test-body" style="display:none">
          ${errorHtml}
          ${screenshotHtml}
          <div class="section">
            <h4>Steps</h4>
            ${stepsHtml}
          </div>
          <div class="section">
            <h4>Logs</h4>
            ${logsHtml}
          </div>
        </div>
      </div>`;
    };

    let groupIndex = 0;
    const renderStatusGroup = (label: string, records: TestRecord[], cssClass: string) => {
      if (!records.length) return '';
      const gid = `group-${groupIndex++}`;
      return `
      <div class="status-group">
        <button class="status-group-header status-group-${cssClass}" onclick="toggleGroup('${gid}')">
          <span class="sg-label">${label}</span>
          <span class="status-group-count">${records.length}</span>
          <span class="sg-chevron">▾</span>
        </button>
        <div class="tests" id="${gid}" style="display:none">${records.map(renderTestCard).join('')}</div>
      </div>`;
    };

    const buildPanel = (browser: string, i: number, allRecords: TestRecord[]) => {
      const bRecords = allRecords.filter(r => r.browser === browser);
      const suites   = [...new Set(bRecords.map(r => r.suite))].sort();

      const suiteSections = suites.map(suite => {
        const sRecords  = bRecords.filter(r => r.suite === suite);
        const sPassed   = sRecords.filter(r => r.status === 'passed');
        const sFailed   = sRecords.filter(r => r.status === 'failed' || r.status === 'timedOut');
        const sSkipped  = sRecords.filter(r => r.status === 'skipped');
        const hasFailed = sFailed.length > 0;
        const sid       = `suite-${browser}-${suite.replace(/\W+/g, '-')}`;

        return `
        <div class="suite-section ${hasFailed ? 'suite-has-failed' : ''}" data-suite="${escapeHtml(suite.toLowerCase())}">
          <button class="suite-header ${hasFailed ? 'suite-header-failed' : ''}" onclick="toggleSuite('${sid}')">
            <span class="suite-icon">📄</span>
            <span class="suite-name">${escapeHtml(suite)}</span>
            <span class="suite-stats">
              <span class="bs-stat bs-passed">✓ ${sPassed.length}</span>
              <span class="bs-stat bs-failed">✗ ${sFailed.length}</span>
              ${sSkipped.length ? `<span class="bs-stat bs-skipped">— ${sSkipped.length}</span>` : ''}
            </span>
            <span class="suite-chevron ${hasFailed ? 'open' : ''}">▾</span>
          </button>
          <div class="suite-body" id="${sid}" style="display:${hasFailed ? 'block' : 'none'}">
            ${renderStatusGroup('Failed', sFailed, 'failed')}
            ${renderStatusGroup('Passed', sPassed, 'passed')}
            ${renderStatusGroup('Skipped', sSkipped, 'skipped')}
          </div>
        </div>`;
      }).join('');

      return `
      <div class="browser-panel ${i === 0 ? 'active' : ''}" id="panel-${browser}">
        <div class="panel-toolbar">
          <div class="search-wrap">
            <span class="search-icon">🔍</span>
            <input class="search-input" type="text" placeholder="Search tests..." oninput="filterTests(this, '${browser}')">
          </div>
          <div class="toolbar-actions">
            <button class="toolbar-btn" onclick="expandAll('${browser}')">Expand All</button>
            <button class="toolbar-btn" onclick="collapseAll('${browser}')">Collapse All</button>
            ${this.records.filter(r => r.browser === browser && (r.status === 'failed' || r.status === 'timedOut')).length
              ? `<button class="toolbar-btn toolbar-btn-danger" onclick="jumpToFailure('${browser}')">Jump to Failure ↓</button>`
              : ''}
          </div>
        </div>
        ${suiteSections}
      </div>`;
    };

    const buildSectionHtml = (sectionRecords: TestRecord[], sectionBrowsers: string[], sectionId: string, isActive: boolean): string => {
      if (!sectionRecords.length) return '';

      const sTotal      = sectionRecords.length;
      const sPassed     = sectionRecords.filter(r => r.status === 'passed').length;
      const sFailed     = sectionRecords.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
      const sSkipped    = sectionRecords.filter(r => r.status === 'skipped').length;
      const sPassedPct  = sTotal ? Math.round((sPassed  / sTotal) * 100) : 0;
      const sFailedPct  = sTotal ? Math.round((sFailed  / sTotal) * 100) : 0;
      const sSkippedPct = sTotal ? 100 - sPassedPct - sFailedPct : 0;

      const sSlowest = [...sectionRecords].filter(r => r.status !== 'skipped').sort((a, b) => b.duration - a.duration).slice(0, 5);
      const sFlaky   = sectionRecords.filter(r => r.retry > 0 && r.status === 'passed');

      const summaryCards = `
      <div class="summary">
        <div class="card total">
          <div class="card-left"><div class="count">${sTotal}</div><div class="label">Total</div></div>
          <div class="card-browser-breakdown">
            ${sectionBrowsers.map(b => { const n = sectionRecords.filter(r => r.browser === b).length; return `<span class="card-b-item">${browserIcons[b] ?? '🌐'} ${escapeHtml(b)}: <strong>${n}</strong></span>`; }).join('')}
          </div>
        </div>
        <div class="card passed">
          <div class="card-left"><div class="count">${sPassed}</div><div class="label">Passed</div></div>
          <div class="card-browser-breakdown">
            ${sectionBrowsers.map(b => { const n = sectionRecords.filter(r => r.browser === b && r.status === 'passed').length; return `<span class="card-b-item">${browserIcons[b] ?? '🌐'} ${escapeHtml(b)}: <strong>${n}</strong></span>`; }).join('')}
          </div>
        </div>
        <div class="card failed">
          <div class="card-left"><div class="count">${sFailed}</div><div class="label">Failed</div></div>
          <div class="card-browser-breakdown">
            ${sectionBrowsers.map(b => { const n = sectionRecords.filter(r => r.browser === b && (r.status === 'failed' || r.status === 'timedOut')).length; return `<span class="card-b-item">${browserIcons[b] ?? '🌐'} ${escapeHtml(b)}: <strong>${n}</strong></span>`; }).join('')}
          </div>
        </div>
        <div class="card skipped">
          <div class="card-left"><div class="count">${sSkipped}</div><div class="label">Skipped</div></div>
          <div class="card-browser-breakdown">
            ${sectionBrowsers.map(b => { const n = sectionRecords.filter(r => r.browser === b && r.status === 'skipped').length; return `<span class="card-b-item">${browserIcons[b] ?? '🌐'} ${escapeHtml(b)}: <strong>${n}</strong></span>`; }).join('')}
          </div>
        </div>
      </div>`;

      const progressBar = `
      <div class="progress-wrap">
        <div class="progress-bar">
          <div style="height:100%;width:${sPassedPct}%;background:#22c55e;"></div>
          <div style="height:100%;width:${sFailedPct}%;background:#ef4444;"></div>
          <div style="height:100%;width:${sSkippedPct}%;background:#f59e0b;"></div>
        </div>
        <div class="progress-labels">
          ${sPassedPct  ? `<span class="prog-label prog-label-passed"  style="left:${sPassedPct / 2}%">${sPassedPct}% passed</span>`   : ''}
          ${sFailedPct  ? `<span class="prog-label prog-label-failed"  style="left:${sPassedPct + sFailedPct / 2}%">${sFailedPct}% failed</span>`   : ''}
          ${sSkippedPct ? `<span class="prog-label prog-label-skipped" style="left:${sPassedPct + sFailedPct + sSkippedPct / 2}%">${sSkippedPct}% skipped</span>` : ''}
        </div>
      </div>`;

      const slowestHtml = sSlowest.map(r =>
        `<div class="slow-row">
          <span class="slow-title">${escapeHtml(r.title)}</span>
          <div class="slow-meta">
            <span class="slow-browser">${browserIcons[r.browser] ?? '🌐'} ${escapeHtml(r.browser)}</span>
            <span class="slow-dur">${(r.duration / 1000).toFixed(2)}s</span>
            <div class="slow-bar-wrap"><div class="slow-bar" style="width:${Math.round((r.duration / sSlowest[0].duration) * 100)}%"></div></div>
          </div>
        </div>`
      ).join('');

      const flakyHtml = sFlaky.length
        ? sFlaky.map(r =>
            `<div class="flaky-row">
              <span class="flaky-title">${escapeHtml(r.title)}</span>
              <span class="slow-browser">${browserIcons[r.browser] ?? '🌐'} ${escapeHtml(r.browser)}</span>
              <span class="retry-badge">↺ passed on retry ${r.retry}</span>
            </div>`).join('')
        : '<p class="no-data">No flaky tests detected.</p>';

      const infoRow = `
      <div class="info-row">
        <div class="env-block">
          <h3>Environment</h3>
          <div class="env-item"><span class="env-key">Base URL</span><span class="env-val">${escapeHtml(this.baseURL || 'N/A')}</span></div>
          <div class="env-item"><span class="env-key">Node.js</span><span class="env-val">${escapeHtml(this.nodeVersion)}</span></div>
          <div class="env-item"><span class="env-key">Platform</span><span class="env-val">${escapeHtml(os.platform())} ${escapeHtml(os.arch())}</span></div>
          <div class="env-item"><span class="env-key">Projects</span><span class="env-val">${sectionBrowsers.map(b => escapeHtml(b)).join(', ')}</span></div>
        </div>
        <div class="slowest-block">
          <h3>Slowest Tests (Top ${sSlowest.length})</h3>
          ${slowestHtml}
        </div>
        <div class="flaky-block">
          <h3>Flaky Tests</h3>
          ${flakyHtml}
        </div>
      </div>`;

      const browserSummaryRows = sectionBrowsers.map(browser => {
        const bRecords  = sectionRecords.filter(r => r.browser === browser);
        const bPassed   = bRecords.filter(r => r.status === 'passed').length;
        const bFailed   = bRecords.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
        const bSkipped  = bRecords.filter(r => r.status === 'skipped').length;
        const bTotal    = bRecords.length;
        const bDuration = bRecords.reduce((sum, r) => sum + r.duration, 0);
        const bDurStr   = bDuration >= 60000
          ? `${Math.floor(bDuration / 60000)}m ${((bDuration % 60000) / 1000).toFixed(1)}s`
          : `${(bDuration / 1000).toFixed(2)}s`;
        const icon        = browserIcons[browser] ?? '🌐';
        const bPassedPct  = bTotal ? Math.round((bPassed  / bTotal) * 100) : 0;
        const bFailedPct  = bTotal ? Math.round((bFailed  / bTotal) * 100) : 0;
        const bSkippedPct = bTotal ? 100 - bPassedPct - bFailedPct : 0;
        const bSummaryId  = `bsummary-${sectionId}-${browser}`;
        const suites = [...new Set(bRecords.map(r => r.suite))].sort();
        const suiteRows = suites.map(suite => {
          const sRecs    = bRecords.filter(r => r.suite === suite);
          const sp = sRecs.filter(r => r.status === 'passed').length;
          const sf = sRecs.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
          const ss = sRecs.filter(r => r.status === 'skipped').length;
          const sd = `${(sRecs.reduce((s, r) => s + r.duration, 0) / 1000).toFixed(2)}s`;
          return `
          <div class="bs-suite-row">
            <span class="bs-suite-name">📄 ${escapeHtml(suite)}</span>
            <span class="bs-stat bs-passed">✓ ${sp}</span>
            <span class="bs-stat bs-failed">✗ ${sf}</span>
            ${ss ? `<span class="bs-stat bs-skipped">— ${ss}</span>` : ''}
            <span class="bs-stat bs-duration">⏱ ${sd}</span>
          </div>`;
        }).join('');
        return `
        <div class="browser-summary-row-wrap">
          <button class="browser-summary-row" onclick="toggleBs('${bSummaryId}', this)">
            <span class="bs-browser">${icon} ${escapeHtml(browser)}</span>
            <span class="bs-stat bs-total">${bTotal} total</span>
            <span class="bs-stat bs-passed">✓ ${bPassed} passed</span>
            <span class="bs-stat bs-failed">✗ ${bFailed} failed</span>
            ${bSkipped ? `<span class="bs-stat bs-skipped">— ${bSkipped} skipped</span>` : ''}
            <span class="bs-stat bs-duration">⏱ ${bDurStr}</span>
            <div class="bs-bar-wrap">
              <div class="bs-bar-seg" style="width:${bPassedPct}%;background:#22c55e"></div>
              <div class="bs-bar-seg" style="width:${bFailedPct}%;background:#ef4444"></div>
              <div class="bs-bar-seg" style="width:${bSkippedPct}%;background:#f59e0b"></div>
            </div>
            <span class="bs-pct bs-pct-passed">${bPassedPct}% passed</span>
            ${bFailedPct  ? `<span class="bs-pct bs-pct-failed">${bFailedPct}% failed</span>`    : ''}
            ${bSkippedPct ? `<span class="bs-pct bs-pct-skipped">${bSkippedPct}% skipped</span>` : ''}
            <span class="bs-chevron">▾</span>
          </button>
          <div class="bs-suite-list" id="${bSummaryId}" style="display:none">${suiteRows}</div>
        </div>`;
      }).join('');

      const browserSummary = `
      <div class="browser-summary">
        <div class="browser-summary-title">Results by ${sectionId === 'ui' ? 'Browser' : 'Project'}</div>
        ${browserSummaryRows}
      </div>`;

      const tabButtons = sectionBrowsers.map((b, i) =>
        `<button class="tab ${i === 0 ? 'active' : ''}" onclick="switchTab('${b}', this)">${browserIcons[b] ?? '🌐'} ${escapeHtml(b)}</button>`
      ).join('');

      const panels = sectionBrowsers.map((b, i) => buildPanel(b, i, sectionRecords)).join('');
      const testSection = sectionBrowsers.length > 1
        ? `<div class="tabs">${tabButtons}</div>${panels}`
        : panels;

      return `
<div class="type-panel ${isActive ? 'active' : ''}" id="type-panel-${sectionId}">
  ${summaryCards}
  ${progressBar}
  ${infoRow}
  ${browserSummary}
  ${testSection}
</div>`;
    };

    const uiSection  = buildSectionHtml(uiRecords,  uiBrowsers, 'ui',  true);
    const apiSection = buildSectionHtml(apiRecords, ['api'],     'api', !uiRecords.length);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Test Report</title>
  <style>
    :root {
      --bg: #f4f6f9; --surface: #ffffff; --surface2: #f8fafc; --border: #e2e8f0;
      --text: #1a1a2e; --text2: #475569; --text3: #94a3b8;
      --header-bg1: #1a1a2e; --header-bg2: #16213e;
    }
    body.dark {
      --bg: #0f172a; --surface: #1e293b; --surface2: #162032; --border: #334155;
      --text: #e2e8f0; --text2: #94a3b8; --text3: #64748b;
      --header-bg1: #0f172a; --header-bg2: #1e293b;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); transition: background .2s, color .2s; }

    /* Header */
    header { background: linear-gradient(135deg, var(--header-bg1), var(--header-bg2)); color: white; padding: 32px 40px; display: flex; align-items: flex-start; justify-content: space-between; }
    .header-left h1 { font-size: 28px; font-weight: 700; }
    .header-left p  { margin-top: 6px; opacity: 0.65; font-size: 13px; }
    .header-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
    .dark-toggle { padding: 7px 14px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.1); color: white; cursor: pointer; }
    .dark-toggle:hover { background: rgba(255,255,255,.2); }

    /* Summary cards */
    .summary { display: flex; gap: 20px; padding: 28px 40px; flex-wrap: wrap; }
    .card { background: var(--surface); border-radius: 12px; padding: 22px 28px; flex: 1; min-width: 160px;
            box-shadow: 0 2px 8px rgba(0,0,0,.07); border-top: 4px solid #ccc; display: flex; align-items: center; gap: 16px; }
    .card.total   { border-color: #6366f1; }
    .card.passed  { border-color: #22c55e; }
    .card.failed  { border-color: #ef4444; }
    .card.skipped { border-color: #f59e0b; }
    .card-left { display: flex; flex-direction: column; }
    .card .count  { font-size: 40px; font-weight: 800; line-height: 1; }
    .card.total   .count { color: #6366f1; }
    .card.passed  .count { color: #22c55e; }
    .card.failed  .count { color: #ef4444; }
    .card.skipped .count { color: #f59e0b; }
    .card .label  { font-size: 13px; color: var(--text2); margin-top: 6px; font-weight: 500; }
    .card-browser-breakdown { display: flex; flex-direction: column; gap: 5px; border-left: 1px solid var(--border); padding-left: 16px; }
    .card-b-item { font-size: 12px; color: var(--text2); white-space: nowrap; }

    /* Progress bar */
    .progress-wrap { margin: 0 40px 28px; position: relative; }
    .progress-bar { height: 10px; border-radius: 99px; background: var(--border); overflow: hidden; display: flex; }
    .seg-passed  { background: #22c55e; }
    .seg-failed  { background: #ef4444; }
    .seg-skipped { background: #f59e0b; }
    .progress-labels { position: relative; height: 22px; margin-top: 4px; }
    .prog-label { position: absolute; transform: translateX(-50%); font-size: 11px; font-weight: 700; white-space: nowrap; }
    .prog-label-passed  { color: #15803d; }
    .prog-label-failed  { color: #b91c1c; }
    .prog-label-skipped { color: #b45309; }

    /* Info panels row */
    .info-row { display: flex; gap: 20px; margin: 0 40px 24px; flex-wrap: wrap; }

    /* Environment info */
    .env-block { background: var(--surface); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.07); padding: 16px 20px; flex: 1; min-width: 200px; }
    .env-block h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text3); margin-bottom: 10px; }
    .env-item { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--border); }
    .env-item:last-child { border-bottom: none; }
    .env-key { color: var(--text3); }
    .env-val { color: var(--text); font-weight: 600; font-family: monospace; }

    /* Slowest tests */
    .slowest-block { background: var(--surface); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.07); padding: 16px 20px; flex: 2; min-width: 280px; }
    .slowest-block h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text3); margin-bottom: 10px; }
    .slow-row { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .slow-row:last-child { border-bottom: none; }
    .slow-title { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .slow-meta { display: flex; align-items: center; gap: 8px; }
    .slow-browser { font-size: 11px; color: var(--text3); white-space: nowrap; }
    .slow-dur { font-size: 13px; font-weight: 700; color: #f59e0b; min-width: 40px; }
    .slow-bar-wrap { flex: 1; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; }
    .slow-bar { height: 100%; background: linear-gradient(90deg, #f59e0b, #ef4444); border-radius: 99px; }

    /* Flaky tests */
    .flaky-block { background: var(--surface); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.07); padding: 16px 20px; flex: 1; min-width: 200px; }
    .flaky-block h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text3); margin-bottom: 10px; }
    .flaky-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .flaky-row:last-child { border-bottom: none; }
    .flaky-title { flex: 1; font-size: 12px; color: var(--text); }

    /* Browser summary */
    .browser-summary { margin: 0 40px 24px; background: var(--surface); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.07); overflow: hidden; }
    .browser-summary-title { padding: 12px 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text3); border-bottom: 1px solid var(--border); }
    .browser-summary-row-wrap { border-bottom: 1px solid var(--border); }
    .browser-summary-row-wrap:last-child { border-bottom: none; }
    .browser-summary-row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 20px; flex-wrap: wrap; background: none; border: none; cursor: pointer; text-align: left; }
    .browser-summary-row:hover { background: var(--surface2); }
    .bs-chevron { font-size: 13px; color: var(--text3); transition: transform .2s; margin-left: auto; }
    .bs-chevron.open { transform: rotate(180deg); }
    .bs-suite-list { background: var(--surface2); border-top: 1px solid var(--border); padding: 4px 0; }
    .bs-suite-row { display: flex; align-items: center; gap: 10px; padding: 8px 20px 8px 36px; flex-wrap: wrap; }
    .bs-suite-row:not(:last-child) { border-bottom: 1px solid var(--border); }
    .bs-suite-name { font-size: 13px; font-weight: 600; color: var(--text2); font-family: monospace; flex: 1; min-width: 160px; }
    .bs-browser { font-size: 14px; font-weight: 700; color: var(--text); min-width: 100px; text-transform: capitalize; }
    .bs-stat { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
    .bs-total    { background: #f1f5f9; color: #475569; }
    .bs-passed   { background: #dcfce7; color: #15803d; }
    .bs-failed   { background: #fee2e2; color: #b91c1c; }
    .bs-skipped  { background: #fef3c7; color: #b45309; }
    .bs-duration { background: #f1f5f9; color: #475569; }
    .bs-bar-wrap { flex: 1; min-width: 80px; height: 8px; background: var(--border); border-radius: 99px; overflow: hidden; display: flex; }
    .bs-bar-seg  { height: 100%; }
    .bs-pct { font-size: 12px; font-weight: 700; white-space: nowrap; }
    .bs-pct-passed  { color: #15803d; }
    .bs-pct-failed  { color: #b91c1c; }
    .bs-pct-skipped { color: #b45309; }

    /* Type tabs (UI / API) */
    .type-tabs { display: flex; gap: 12px; padding: 28px 40px 0; }
    .type-tab { display: flex; align-items: center; gap: 8px; padding: 12px 24px; font-size: 15px; font-weight: 700;
                border: 2px solid var(--border); border-radius: 10px 10px 0 0; background: var(--surface2);
                cursor: pointer; color: var(--text2); border-bottom: none; transition: all .15s; }
    .type-tab:hover { color: var(--text); background: var(--surface); }
    .type-tab.active { background: var(--surface); color: #6366f1; border-color: #6366f1; border-bottom: 2px solid var(--surface); margin-bottom: -2px; }
    .type-tab-count { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: #ede9fe; color: #6366f1; }
    .type-tab.active .type-tab-count { background: #6366f1; color: white; }
    .type-panel { display: none; border-top: 2px solid #6366f1; }
    .type-panel.active { display: block; }

    /* Browser tabs */
    .tabs { display: flex; gap: 8px; padding: 0 40px; border-bottom: 2px solid var(--border); margin-top: 16px; }
    .tab { padding: 10px 20px; font-size: 14px; font-weight: 600; border: none; background: none;
           cursor: pointer; color: var(--text2); border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all .15s; }
    .tab:hover  { color: var(--text); }
    .tab.active { color: #6366f1; border-bottom-color: #6366f1; }

    /* Browser panels */
    .browser-panel { display: none; padding: 24px 40px; }
    .browser-panel.active { display: block; }

    /* Toolbar */
    .panel-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .search-wrap { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; flex: 1; max-width: 320px; }
    .search-icon { font-size: 14px; }
    .search-input { border: none; background: none; outline: none; font-size: 13px; color: var(--text); width: 100%; }
    .toolbar-actions { display: flex; gap: 8px; }
    .toolbar-btn { padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 7px; border: 1px solid var(--border); background: var(--surface); color: var(--text2); cursor: pointer; }
    .toolbar-btn:hover { background: var(--surface2); }
    .toolbar-btn-danger { border-color: #fecaca; color: #b91c1c; background: #fff5f5; }
    .toolbar-btn-danger:hover { background: #fee2e2; }

    /* Suite sections */
    .suite-section { background: var(--surface); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.06); overflow: hidden; margin-bottom: 12px; }
    .suite-section.suite-has-failed { box-shadow: 0 2px 14px rgba(239,68,68,.18); border: 1px solid #fecaca; }
    .suite-header { width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: var(--surface2); border: none; cursor: pointer; text-align: left; }
    .suite-header:hover { filter: brightness(.97); }
    .suite-header-failed { background: #fff5f5 !important; }
    body.dark .suite-header-failed { background: #2d1515 !important; }
    .suite-icon { font-size: 16px; }
    .suite-name { flex: 1; font-size: 15px; font-weight: 700; color: var(--text); font-family: monospace; }
    .suite-stats { display: flex; gap: 8px; align-items: center; }
    .suite-chevron { color: var(--text3); font-size: 14px; transition: transform .2s; }
    .suite-chevron.open { transform: rotate(180deg); }

    /* Status groups */
    .status-group-header { display: flex; justify-content: space-between; align-items: center;
                           padding: 10px 22px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .status-group-failed  { background: #fff5f5; color: #b91c1c; border-left: 4px solid #ef4444; }
    .status-group-passed  { background: #f0fdf4; color: #15803d; border-left: 4px solid #22c55e; }
    .status-group-skipped { background: #fffbeb; color: #b45309; border-left: 4px solid #f59e0b; }
    body.dark .status-group-failed  { background: #2d1515; }
    body.dark .status-group-passed  { background: #14291a; }
    body.dark .status-group-skipped { background: #2d2208; }
    .status-group-header { width: 100%; border: none; cursor: pointer; text-align: left; }
    .status-group-header:hover { filter: brightness(.96); }
    .sg-label { flex: 1; }
    .status-group-count { font-size: 18px; }
    .sg-chevron { font-size: 13px; opacity: 0.6; margin-left: 8px; transition: transform .2s; display: inline-block; }
    .sg-chevron.open { transform: rotate(180deg); }

    /* Test cards */
    .tests { padding: 12px 22px; display: flex; flex-direction: column; gap: 8px; }
    .test-card { background: var(--surface2); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    .test-card.hidden { display: none; }
    .test-header { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 16px;
                   background: none; border: none; cursor: pointer; text-align: left; font-size: 14px; }
    .test-header:hover { background: var(--border); }
    .test-title { flex: 1; font-weight: 600; color: var(--text); }
    .duration   { font-size: 12px; color: var(--text3); }
    .chevron    { color: var(--text3); font-size: 14px; transition: transform .2s; }
    .chevron.open { transform: rotate(180deg); }

    .status-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 99px; white-space: nowrap; }
    .status-passed   { background: #dcfce7; color: #15803d; }
    .status-failed   { background: #fee2e2; color: #b91c1c; }
    .status-skipped  { background: #fef3c7; color: #b45309; }
    .status-timedOut { background: #fce7f3; color: #9d174d; }
    .retry-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 99px; background: #fef3c7; color: #b45309; white-space: nowrap; }

    .test-body { padding: 0 16px 16px; border-top: 1px solid var(--border); }
    .section   { margin-top: 12px; }
    .section h4 { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text3); letter-spacing: .05em; margin-bottom: 8px; }
    .no-data   { font-size: 13px; color: var(--text3); font-style: italic; }

    .steps { list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .step  { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 5px 10px; border-radius: 6px; background: var(--surface); }
    .step-passed { border-left: 3px solid #22c55e; }
    .step-failed { border-left: 3px solid #ef4444; background: #fff5f5; }
    .step-icon   { font-size: 11px; width: 14px; }
    .step-passed .step-icon { color: #22c55e; }
    .step-failed  .step-icon { color: #ef4444; }
    .step-title    { flex: 1; color: var(--text2); }
    .step-duration { font-size: 11px; color: var(--text3); }

    .screenshot { width: 100%; border-radius: 8px; border: 1px solid var(--border); cursor: zoom-in; }
    .screenshot:hover { opacity: .95; }

    .logs { font-size: 12px; background: #0f172a; color: #94a3b8; padding: 12px 16px; border-radius: 8px;
            overflow-x: auto; line-height: 1.6; max-height: 200px; overflow-y: auto; }
    .error-box { background: #fff5f5; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 16px; margin-top: 12px; }
    body.dark .error-box { background: #2d1515; border-color: #7f1d1d; }
    .error-box-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .error-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #b91c1c; letter-spacing: .05em; }
    .copy-btn { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 6px; border: 1px solid #fecaca; background: white; color: #b91c1c; cursor: pointer; }
    .copy-btn:hover { background: #fee2e2; }
    .copy-btn.copied { background: #dcfce7; color: #15803d; border-color: #bbf7d0; }
    .error-message { font-size: 12px; color: #b91c1c; white-space: pre-wrap; word-break: break-word; background: #fee2e2; padding: 10px 12px; border-radius: 6px; line-height: 1.6; }
    .error-stack-details { margin-top: 10px; }
    .error-stack-details summary { font-size: 12px; font-weight: 600; color: var(--text3); cursor: pointer; padding: 4px 0; }
    .error-stack { font-size: 11px; color: var(--text2); white-space: pre-wrap; word-break: break-word; background: var(--surface2); border: 1px solid var(--border); padding: 10px 12px; border-radius: 6px; margin-top: 6px; line-height: 1.6; max-height: 240px; overflow-y: auto; }

    footer { text-align: center; padding: 24px; font-size: 12px; color: var(--text3); margin-top: 20px; }
  </style>
</head>
<body>

<header>
  <div class="header-left">
    <h1>Test Report</h1>
    <p>Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Duration: ${duration}s &nbsp;|&nbsp; Total: ${total} tests</p>
  </div>
  <div class="header-actions">
    <button class="dark-toggle" onclick="toggleDark()">🌙 Dark Mode</button>
  </div>
</header>

<div class="type-tabs">
  ${uiBrowsers.length ? `<button class="type-tab active" onclick="switchTypeTab('ui', this)">🖥 UI Tests <span class="type-tab-count">${uiRecords.length}</span></button>` : ''}
  ${apiRecords.length ? `<button class="type-tab ${uiBrowsers.length ? '' : 'active'}" onclick="switchTypeTab('api', this)">🌐 API Tests <span class="type-tab-count">${apiRecords.length}</span></button>` : ''}
</div>

${uiSection}
${apiSection}

<footer>Custom Playwright HTML Reporter</footer>

<script>
  function toggle(id) {
    const card = document.getElementById(id);
    const body = card.querySelector('.test-body');
    const chevron = card.querySelector('.chevron');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    chevron.classList.toggle('open', open);
  }
  function toggleBs(id, btn) {
    const body = document.getElementById(id);
    const chevron = btn.querySelector('.bs-chevron');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    chevron.classList.toggle('open', open);
  }
  function toggleSuite(id) {
    const body = document.getElementById(id);
    const btn = body.previousElementSibling;
    const chevron = btn.querySelector('.suite-chevron');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    chevron.classList.toggle('open', open);
  }
  function toggleGroup(id) {
    const body = document.getElementById(id);
    const btn = body.previousElementSibling;
    const chevron = btn.querySelector('.sg-chevron');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    chevron.classList.toggle('open', open);
  }
  function switchTypeTab(type, btn) {
    document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.type-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('type-panel-' + type).classList.add('active');
  }
  function switchTab(browser, btn) {
    const typePanel = btn.closest('.type-panel');
    typePanel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    typePanel.querySelectorAll('.browser-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + browser).classList.add('active');
  }
  function expandAll(browser) {
    const panel = document.getElementById('panel-' + browser);
    panel.querySelectorAll('.suite-body').forEach(b => b.style.display = 'block');
    panel.querySelectorAll('.suite-chevron').forEach(c => c.classList.add('open'));
    panel.querySelectorAll('.tests').forEach(b => b.style.display = 'flex');
    panel.querySelectorAll('.sg-chevron').forEach(c => c.classList.add('open'));
  }
  function collapseAll(browser) {
    const panel = document.getElementById('panel-' + browser);
    panel.querySelectorAll('.suite-body').forEach(b => b.style.display = 'none');
    panel.querySelectorAll('.suite-chevron').forEach(c => c.classList.remove('open'));
    panel.querySelectorAll('.tests').forEach(b => b.style.display = 'none');
    panel.querySelectorAll('.sg-chevron').forEach(c => c.classList.remove('open'));
    panel.querySelectorAll('.test-body').forEach(b => b.style.display = 'none');
    panel.querySelectorAll('.chevron').forEach(c => c.classList.remove('open'));
  }
  function jumpToFailure(browser) {
    const panel = document.getElementById('panel-' + browser);
    const failed = panel.querySelector('.suite-has-failed');
    if (failed) failed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function filterTests(input, browser) {
    const q = input.value.toLowerCase().trim();
    const panel = document.getElementById('panel-' + browser);
    panel.querySelectorAll('.test-card').forEach(card => {
      const title = card.dataset.title || '';
      card.classList.toggle('hidden', q.length > 0 && !title.includes(q));
    });
    panel.querySelectorAll('.suite-section').forEach(suite => {
      const visible = [...suite.querySelectorAll('.test-card')].some(c => !c.classList.contains('hidden'));
      suite.style.display = visible ? '' : 'none';
    });
  }
  function copyError(btn) {
    navigator.clipboard.writeText(btn.dataset.error).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  }
  function toggleDark() {
    document.body.classList.toggle('dark');
    const btn = document.querySelector('.dark-toggle');
    btn.textContent = document.body.classList.contains('dark') ? '☀️ Light Mode' : '🌙 Dark Mode';
  }
</script>
</body>
</html>`;

    fs.writeFileSync(this.outputFile, html, 'utf-8');
    console.log(`\nCustom HTML report: ${path.resolve(this.outputFile)}`);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default CustomHtmlReporter;
