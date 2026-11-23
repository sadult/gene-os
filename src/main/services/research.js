'use strict';
const E = require('./entities');
const database = require('../db/database');
const { now } = database;

const PROPOSAL_SECTIONS = [
  ['title', 'Title'], ['abstract', 'Abstract'], ['introduction', 'Introduction'],
  ['problem', 'Problem Statement'], ['importance', 'Importance of Research'],
  ['literature', 'Literature Review'], ['gap', 'Research Gap'], ['objectives', 'Objectives'],
  ['hypotheses', 'Hypotheses'], ['methods', 'Materials and Methods'], ['design', 'Experimental Design'],
  ['model', 'Statistical Model'], ['data', 'Data Collection'], ['expected', 'Expected Results'],
  ['timeline', 'Timeline'], ['references', 'References'],
];

const THESIS_CHECKLIST = [
  'Supervisor & advisor confirmed', 'Proposal approved by department', 'Ethics / animal-use approval',
  'Data access agreement', 'Data cleaning & QC complete', 'Pedigree validated', 'Variance components estimated',
  'Breeding values / main analysis complete', 'Results tables & figures', 'Discussion drafted',
  'Full thesis draft to supervisor', 'Plagiarism check', 'Defense scheduled', 'Final submission',
].map((title) => ({ title, done: false }));

const wordCount = (s) => (String(s || '').match(/[\p{L}\p{N}]+/gu) || []).length;

const research = {
  list: (opts) => E.projects.list(opts),
  get: (id) => E.projects.get(id),
  create(data) {
    if (!data || !String(data.name || '').trim()) throw new Error('Project name is required');
    return database.get().transaction(() => {
      const p = E.projects.create({ checklist: THESIS_CHECKLIST, ...data });
      PROPOSAL_SECTIONS.forEach(([skey, title], i) => E.sections.create({ project_id: p.id, skey, title, content: '', sort: i }));
      if (!E.projects.count({ active: true })) E.projects.update(p.id, { active: true });
      return E.projects.get(p.id);
    })();
  },
  update: (id, patch) => E.projects.update(id, patch),
  remove(id) {
    const d = database.get();
    return d.transaction(() => {
      for (const t of ['tasks', 'notes', 'files']) d.prepare(`UPDATE ${t} SET project_id = NULL WHERE project_id = ?`).run(id);
      d.prepare("DELETE FROM search_fts WHERE entity = 'section' AND entity_id IN (SELECT id FROM proposal_sections WHERE project_id = ?)").run(id);
      return E.projects.remove(id); // sections, versions & milestones cascade
    })();
  },
  setActive(id) {
    return database.get().transaction(() => {
      database.get().prepare('UPDATE projects SET active = 0').run();
      return E.projects.update(id, { active: true });
    })();
  },
  active: () => E.projects.list({ filter: { active: true }, limit: 1 })[0] || null,

  sections: (projectId) => E.sections.list({ filter: { project_id: projectId }, sort: 'sort', dir: 'ASC' }),
  getSection: (id) => E.sections.get(id),
  addSection(projectId, title) {
    const max = database.get().prepare('SELECT COALESCE(MAX(sort),0) m FROM proposal_sections WHERE project_id=?').get(projectId).m;
    return E.sections.create({ project_id: projectId, skey: 'custom-' + Date.now(), title, sort: max + 1 });
  },
  // Autosave entry point. Snapshots a version when content diverged and the last snapshot is > 5 min old (or forced).
  saveSection(id, patch, { snapshot = false } = {}) {
    const d = database.get();
    return d.transaction(() => {
      const cur = E.sections.get(id);
      if (!cur) throw new Error('Section not found');
      if (patch.content !== undefined && patch.content !== cur.content && cur.content) {
        const last = d.prepare('SELECT created_at FROM section_versions WHERE section_id=? ORDER BY id DESC LIMIT 1').get(id);
        if (snapshot || !last || Date.now() - Date.parse(last.created_at) > 5 * 60 * 1000) {
          d.prepare('INSERT INTO section_versions (section_id, content, words, created_at) VALUES (?,?,?,?)').run(id, cur.content, wordCount(cur.content), now());
        }
      }
      return E.sections.update(id, patch);
    })();
  },
  removeSection: (id) => E.sections.remove(id),
  versions: (sectionId) => database.get().prepare('SELECT id, words, created_at, substr(content,1,160) preview FROM section_versions WHERE section_id=? ORDER BY id DESC').all(sectionId),
  version: (versionId) => database.get().prepare('SELECT * FROM section_versions WHERE id=?').get(versionId),
  restoreVersion(versionId) {
    const v = research.version(versionId);
    if (!v) throw new Error('Version not found');
    return research.saveSection(v.section_id, { content: v.content }, { snapshot: true });
  },
  progress(projectId) {
    const secs = research.sections(projectId);
    const ms = research.milestones(projectId);
    const words = secs.reduce((a, s) => a + wordCount(s.content), 0);
    const doneSecs = secs.filter((s) => s.status === 'done').length;
    const draftSecs = secs.filter((s) => s.status === 'draft' || (s.status !== 'done' && wordCount(s.content) > 0)).length;
    const p = E.projects.get(projectId);
    const cl = (p && p.checklist) || [];
    return {
      sections: secs.length, doneSections: doneSecs, draftSections: draftSecs, words,
      proposalPct: secs.length ? Math.round(((doneSecs + draftSecs * 0.5) / secs.length) * 100) : 0,
      milestones: ms.length, milestonesDone: ms.filter((m) => m.status === 'done').length,
      timelinePct: ms.length ? Math.round(ms.reduce((a, m) => a + (m.status === 'done' ? 100 : m.progress || 0), 0) / ms.length) : 0,
      checklistPct: cl.length ? Math.round((cl.filter((c) => c.done).length / cl.length) * 100) : 0,
    };
  },
  exportMarkdown(projectId) {
    const p = E.projects.get(projectId);
    if (!p) throw new Error('Project not found');
    const lines = [`# ${p.title || p.name}`, ''];
    if (p.supervisor) lines.push(`**Supervisor:** ${p.supervisor}  `);
    if (p.field) lines.push(`**Field:** ${p.field}  `);
    if ((p.keywords || []).length) lines.push(`**Keywords:** ${p.keywords.join(', ')}  `);
    lines.push('');
    for (const s of research.sections(projectId)) {
      if (s.skey === 'title') continue;
      lines.push(`## ${s.title}`, '', s.content || '_(empty)_', '');
    }
    return lines.join('\n');
  },

  milestones: (projectId) => E.milestones.list({ filter: { project_id: projectId }, sort: 'start_date', dir: 'ASC' }),
  addMilestone(data) {
    if (!data.project_id || !data.title) throw new Error('Milestone needs a project and a title');
    return E.milestones.create(data);
  },
  updateMilestone: (id, patch) => E.milestones.update(id, patch),
  removeMilestone: (id) => E.milestones.remove(id),
  wordCount,
};

module.exports = { research, PROPOSAL_SECTIONS };
