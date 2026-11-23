'use strict';
// End-to-end smoke test of the database + service layer against a temporary data folder.
// Run:  npm run test:db      (uses the real better-sqlite3 driver; Electron APIs are not needed)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gene-os-test-'));
// Simulate an existing Gene Terminal 1.x installation to exercise the automatic data migration.
const appData = path.join(tmp, 'AppData');
const legacy = path.join(appData, 'Gene Terminal', 'data');
fs.mkdirSync(legacy, { recursive: true });
{ const Legacy = require('better-sqlite3'); const l = new Legacy(path.join(legacy, 'gene-terminal.db')); l.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('from-1.x');"); l.close(); }
const fakeApp = { getPath: (n) => (n === 'appData' ? appData : path.join(appData, 'Gene OS')) };
const paths = require('../src/main/paths');
paths.init(fakeApp);
require('../src/main/logger').init(paths.logsDir());
const database = require('../src/main/db/database');
database.open(paths.dbFile());

const settings = require('../src/main/services/settings');
const { tasks } = require('../src/main/services/tasks');
const { research } = require('../src/main/services/research');
const { courses, notes, bookmarks } = require('../src/main/services/academic');
const { library } = require('../src/main/services/library');
const { search, dashboard, shellHistory, clipboard } = require('../src/main/services/core');
const { backup } = require('../src/main/services/backup');
const { parseArgs, expandEnv, splitIconLocation } = require('../src/main/services/apps');
const { tools } = require('../src/main/services/tools');

let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.stack || e); process.exitCode = 1; }
}

(async () => {
  console.log('Gene OS DB smoke test →', tmp);
  await step('legacy 1.x data migrated & schema upgraded to v2', () => {
    assert.ok(paths.migratedFrom() && paths.migratedFrom().includes('Gene Terminal'));
    assert.equal(database.get().prepare('SELECT v FROM marker').get().v, 'from-1.x');
    assert.ok(fs.existsSync(path.join(paths.dataDir(), 'gene-os.db')));
    assert.equal(database.get().pragma('user_version', { simple: true }), 2);
  });
  await step('lock-screen PIN & protected security keys', () => {
    assert.equal(settings.getAll()['security.hasPin'], false);
    assert.throws(() => settings.set('security.pinHash', 'x'));
    assert.throws(() => settings.setPin('12'));
    settings.setPin('2468');
    assert.equal(settings.getAll()['security.hasPin'], true);
    assert.ok(!('security.pinHash' in settings.getAll()));
    assert.ok(settings.verifyPin('2468')); assert.ok(!settings.verifyPin('1111'));
    assert.throws(() => settings.clearPin('0000')); settings.clearPin('2468');
    assert.equal(settings.getAll()['security.hasPin'], false);
  });
  await step('tool run history (save, prune to 60, pin, usage, export, reset prefix)', () => {
    for (let i = 0; i < 65; i++) tools.saveRun('hwe', { AA: String(i) }, `run ${i}`);
    assert.equal(tools.runs('hwe', 100).length, 60);
    const first = tools.runs('hwe', 1)[0]; assert.equal(first.inputs.AA, '64');
    tools.pinRun(first.id, true); assert.ok(tools.runs('hwe', 1)[0].pinned);
    assert.equal(tools.usage()[0].tool_id, 'hwe');
    assert.ok(tools.exportRuns('hwe').startsWith('tool,date'));
    settings.set('tools.digits', 6); settings.resetPrefix('tools.'); assert.equal(settings.get('tools.digits'), 4);
    assert.ok(tools.clearRuns() >= 60);
  });
  await step('settings defaults + persistence', () => { assert.equal(settings.get('appearance.accent'), '#59D5C3'); assert.equal(settings.get('behavior.landing'), 'home'); assert.equal(settings.get('calendar.weekStart'), 'mon'); assert.equal(settings.get('home.preset'), 'balanced'); settings.set('appearance.accent', '#7AA2F7'); assert.equal(settings.getAll()['appearance.accent'], '#7AA2F7'); assert.equal(settings.get('profile').name, 'Mersad'); });
  await step('tasks CRUD, recurrence, stats', () => {
    const t = tasks.create({ title: 'Estimate variance components', priority: 'high', tags: ['thesis'], subtasks: [{ title: 'clean data', done: false }], recurrence: 'weekly', deadline: new Date(Date.now() - 3600e3).toISOString() });
    assert.deepEqual(t.tags, ['thesis']); assert.equal(t.subtasks.length, 1);
    const done = tasks.complete(t.id);
    assert.equal(done.status, 'completed'); assert.ok(done.next, 'recurring task creates next occurrence');
    assert.ok(Date.parse(done.next.deadline) > Date.parse(t.deadline) + 6 * 864e5);
    tasks.logTime(done.next.id, 25);
    assert.equal(tasks.get(done.next.id).actual_min, 25);
    assert.throws(() => tasks.create({ title: '  ' }));
    const s = tasks.stats(); assert.equal(s.completed, 1); assert.equal(s.open, 1);
    tasks.remove(done.next.id); assert.equal(tasks.get(done.next.id), null);
    // Iranian work week: a Wednesday task repeats on the following Saturday
    const wed = new Date(2026, 10, 25, 17, 0); // Wed 25 Nov 2026
    const iw = tasks.create({ title: 'Weekly lab report', recurrence: 'satwed', deadline: wed.toISOString() });
    const nx = tasks.complete(iw.id).next; assert.equal(new Date(nx.deadline).getDay(), 6);
    tasks.remove(nx.id);
  });
  let pid;
  await step('research project, sections, versions, milestones, export', () => {
    const p = research.create({ name: 'MSc thesis', title: 'Genetic parameters of egg production', keywords: ['h2', 'REML'] });
    pid = p.id;
    const secs = research.sections(p.id); assert.equal(secs.length, 16); assert.ok(p.active);
    research.saveSection(secs[1].id, { content: 'First draft of the abstract.' });
    research.saveSection(secs[1].id, { content: 'Second draft of the abstract.' }, { snapshot: true });
    assert.equal(research.versions(secs[1].id).length, 1);
    research.restoreVersion(research.versions(secs[1].id)[0].id);
    assert.equal(research.getSection(secs[1].id).content, 'First draft of the abstract.');
    research.addMilestone({ project_id: p.id, title: 'Data collection', start_date: '2026-12-01', end_date: '2027-02-01', progress: 40 });
    const g = research.progress(p.id); assert.equal(g.milestones, 1); assert.ok(g.words > 0);
    assert.ok(research.exportMarkdown(p.id).includes('## Abstract'));
  });
  await step('courses, topics, flashcards (Leitner), notes journal', () => {
    const c = courses.create({ name: 'Quantitative Genetics', code: 'AG501' });
    courses.addTopic(c.id, { title: 'Heritability' }); courses.addTopic(c.id, { title: 'HW 1', kind: 'assignment', due_date: '2026-12-10' });
    const card = courses.addCard(c.id, 'Define h²', 'σ²A / σ²P');
    assert.equal(courses.reviewCard(card.id, true).box, 2); assert.equal(courses.reviewCard(card.id, false).box, 1);
    const o = courses.overview(c.id); assert.equal(o.topicCount, 1); assert.equal(o.assignments, 1);
    const j1 = notes.journal('2026-11-23'); const j2 = notes.journal('2026-11-23'); assert.equal(j1.id, j2.id);
    notes.create({ title: 'REML notes', content: 'AIREMLF90 converged after 12 rounds', course_id: c.id });
    courses.remove(c.id); assert.equal(notes.list({ filter: { title: 'REML notes' } })[0].course_id, null);
  });
  await step('bookmarks normalize/import/export', () => {
    const b = bookmarks.create({ url: 'ncbi.nlm.nih.gov/pubmed', category: 'Research' });
    assert.equal(b.url, 'https://ncbi.nlm.nih.gov/pubmed'); assert.equal(b.name, 'https://ncbi.nlm.nih.gov/pubmed');
    assert.throws(() => bookmarks.create({ url: 'javascript:alert(1)' }));
    const r = bookmarks.importText('<DL><DT><H3>Journals</H3><DL><DT><A HREF="https://www.journalofdairyscience.org">JDS</A><DT><A HREF="https://ncbi.nlm.nih.gov/pubmed">dup</A></DL></DL>');
    assert.equal(r.added, 1); assert.equal(r.skipped, 1);
    assert.ok(bookmarks.exportHtml().includes('JDS'));
  });
  await step('library linked import, hashing, duplicate detection', async () => {
    const dir = path.join(tmp, 'papers'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'original.txt'), 'BLUP text');
    fs.writeFileSync(path.join(dir, 'copy.txt'), 'BLUP text');
    fs.writeFileSync(path.join(dir, 'Mrode_2014_linear_models.txt'), 'unique content');
    const r = await library.importPaths([dir], { mode: 'linked' });
    assert.equal(r.imported.length, 2); assert.equal(r.duplicates.length, 1);
    assert.equal(r.imported.find((x) => x.name.startsWith('Mrode')).year, 2014);
    const f = r.imported.find((x) => !x.name.startsWith('Mrode')); assert.equal(f.stored_path, f.original_path);
    const m = await library.importPaths([path.join(dir, 'copy.txt')], { mode: 'managed', allowDuplicates: true });
    assert.ok(m.imported[0].stored_path.startsWith(paths.libraryDir()));
    assert.equal((await library.readText(f.id)).text, 'BLUP text');
    await library.remove(m.imported[0].id, { deleteManagedCopy: true });
    assert.ok(!fs.existsSync(m.imported[0].stored_path)); assert.ok(fs.existsSync(path.join(dir, 'copy.txt')), 'original untouched');
  });
  await step('full-text search & dashboard summary', () => {
    assert.ok(search.query('variance').some((x) => x.entity === 'task'));
    assert.ok(search.query('abstract').length > 0);
    assert.ok(search.rebuild() > 0);
    const d = dashboard(); assert.ok(d.counts.projects >= 1); assert.ok(Array.isArray(d.deadlines));
  });
  await step('shell history, aliases, clipboard', () => {
    shellHistory.add('task list'); assert.deepEqual(shellHistory.list().slice(-1), ['task list']);
    shellHistory.setAlias('td', 'task list --today'); assert.equal(shellHistory.aliases()[0].name, 'td');
    assert.throws(() => shellHistory.setAlias('1bad', 'x'));
    clipboard.add('copied', 'test'); assert.equal(clipboard.list()[0].content, 'copied');
  });
  await step('backup, validation, JSON export/import roundtrip', async () => {
    const b = await backup.create({}); assert.ok(fs.existsSync(b.file));
    assert.equal(database.validateFile(b.file).version, database.latestVersion());
    const bad = path.join(tmp, 'bad.db'); fs.writeFileSync(bad, 'nope'); assert.throws(() => database.validateFile(bad));
    const json = backup.exportJson(); const before = tasks.count({});
    backup.reset({ keepProfile: true }); assert.equal(tasks.count({}), 0);
    backup.importJson(json); assert.equal(tasks.count({}), before);
    assert.ok(research.get(pid));
  });
  await step('launch argument parsing & icon locations', () => {
    assert.deepEqual(parseArgs('--vanilla "C:\\My Data\\run.R" -q'), ['--vanilla', 'C:\\My Data\\run.R', '-q']);
    process.env.GOS_TEST_ROOT = 'C:\\Win';
    assert.equal(expandEnv('%gos_test_root%\\system32\\shell32.dll'), 'C:\\Win\\system32\\shell32.dll');
    assert.deepEqual(splitIconLocation('%GOS_TEST_ROOT%\\x.dll,-12'), { file: 'C:\\Win\\x.dll', index: -12 });
    assert.deepEqual(splitIconLocation('C:\\a.exe', 3), { file: 'C:\\a.exe', index: 3 });
  });

  database.close();
  console.log(`\n${passed} step(s) passed${process.exitCode ? ' — FAILURES above' : ''}`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
})();
