// Terminal view: window chrome, scrollback, powerline prompt, live syntax highlighting with history
// ghost-suggestions, Tab completion popup and keyboard handling. Mountable in any container; all views
// share the single gsh session (only one is mounted at a time).
import { h, clear, copyText, toast } from '../ui.js';
import { icon } from '../icons.js';
import { settings } from '../state.js';
import { shell, execute, highlightHTML, complete, welcome } from './shell.js';

export function mountTerminal(container, { compact = false } = {}) {
  const out = h('div.tw-out');
  const pl1 = h('div.pl');
  const arrow = h('span.arrow');
  const hlInner = h('span.inner');
  const hl = h('div.ti-hl', hlInner);
  const input = h('input.ti-in', { spellcheck: 'false', autocomplete: 'off', 'aria-label': 'gsh command input' });
  const ti = h('div.ti', hl, input);
  const busy = h('span.busy', { hidden: true });
  const sugg = h('div.term-sugg2', { hidden: true });
  const title = h('div.tw-title');
  const head = h('div.tw-head',
    h('div.tw-dots', h('i'), h('i'), h('i')), title,
    h('button.tw-tool', { title: 'Clear (Ctrl+L)', onclick: () => shell.clear() }, icon('trash', 13)),
    h('button.tw-tool', { title: 'Copy scrollback', onclick: () => copyText(shell.lines.map((n) => n.textContent).join('\n'), 'terminal') }, icon('copy', 13)),
    compact ? h('button.tw-tool', { title: 'Open full terminal (Ctrl+`)', onclick: () => window.__os.nav('terminal') }, icon('external', 13)) : null,
    h('button.tw-tool', { title: 'Terminal settings', onclick: () => window.__os.nav('settings', { section: 'terminal' }) }, icon('settings', 13)));
  const prompt = h('div.tw-prompt', sugg, pl1, h('div.pl2', arrow, ti, busy));
  const win = h('div.tw', head, out, prompt);
  container.append(win);

  let hIndex = -1, draft = '', sel = 0, items = [], ghost = '', raf = 0;
  const scroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { out.scrollTop = out.scrollHeight; }); };

  function renderPrompt() {
    const style = settings.get('terminal.prompt') || 'powerline';
    const ok = !shell.last.code;
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    title.innerHTML = '';
    title.append(h('b', 'gsh'), ` — ${shell.user}@${shell.host}: ${shell.cwd}`);
    clear(pl1); clear(arrow);
    pl1.hidden = style === 'minimal';
    if (style === 'powerline') {
      pl1.append(h('span.corner', '╭─'), h('span.seg.s-brand', '🧬 GENE OS'), h('span.seg.s-user', `${shell.user}@${shell.host}`), h('span.seg.s-cwd', shell.cwd), shell.project ? h('span.seg.s-proj', `◆ ${shell.project}`) : null,
        h('span.pl-right', shell.last.ms ? h(`span.${ok ? 'ok' : 'err'}`, `${ok ? '✔' : '✘ ' + shell.last.code} ${shell.last.ms}ms`) : null, h('span', time)));
      arrow.append(h('span.corner', '╰─'), '❯');
    } else if (style === 'classic') {
      pl1.append(h('span.c-acc.c-bold', '[GENE·OS]'), ' ', h('span.c-acc2', `${shell.user}@${shell.host}`), ' ', h('span.h-path', shell.cwd), shell.project ? h('span.c-purple', `  (${shell.project})`) : null, h('span.pl-right', h('span', time)));
      arrow.append('🧬 ❯');
    } else arrow.append('❯');
    arrow.classList.toggle('bad', !ok);
    busy.hidden = !shell.busy;
  }
  function computeGhost() {
    const v = input.value;
    if (!v || settings.get('terminal.ghost') === false || input.selectionStart !== v.length) return '';
    const hit = [...shell.history].reverse().find((x) => x.startsWith(v) && x !== v);
    return hit ? hit.slice(v.length) : '';
  }
  function renderInput() {
    const plain = settings.get('terminal.highlight') === false;
    ti.classList.toggle('plain', plain);
    ghost = computeGhost();
    if (!plain) { hlInner.innerHTML = highlightHTML(input.value, ghost) || ''; hlInner.style.transform = `translateX(${-input.scrollLeft}px)`; }
  }
  function hideSugg() { sugg.hidden = true; items = []; }
  function drawSugg() {
    clear(sugg);
    if (!items.length) { sugg.hidden = true; return; }
    sugg.hidden = false;
    items.forEach((it, i) => sugg.append(h(`div${i === sel ? '.sel' : ''}`, { onmousedown: (e) => { e.preventDefault(); apply(it); } }, h('span', (it.label || it.value).trim()), h('span.d', it.desc || ''))));
    sugg.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function apply(it) { input.value = it.value; hideSugg(); renderInput(); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  async function tab() {
    if (!sugg.hidden && items.length) { apply(items[sel] || items[0]); return; }
    items = await complete(input.value); sel = 0;
    if (items.length === 1) return apply(items[0]);
    if (items.length > 1) {
      let p = items[0].value; for (const it of items) while (!it.value.startsWith(p)) p = p.slice(0, -1);
      if (p.length > input.value.length) { input.value = p; renderInput(); }
      drawSugg();
    }
  }

  input.addEventListener('input', () => { hIndex = -1; if (!sugg.hidden) hideSugg(); renderInput(); });
  input.addEventListener('scroll', renderInput);
  input.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) renderInput(); });
  input.addEventListener('blur', () => setTimeout(hideSugg, 120));
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!sugg.hidden && items.length) { apply(items[sel]); return; }
      const v = input.value; input.value = ''; hIndex = -1; hideSugg(); renderInput();
      await execute(v); return;
    }
    if (e.key === 'Tab') { e.preventDefault(); await tab(); return; }
    if (e.key === 'ArrowRight' && ghost && input.selectionStart === input.value.length) { e.preventDefault(); input.value += ghost; renderInput(); return; }
    if (e.key === 'End' && ghost) { input.value += ghost; renderInput(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !sugg.hidden) { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; drawSugg(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (!shell.history.length) return; if (hIndex === -1) { draft = input.value; hIndex = shell.history.length; } hIndex = Math.max(0, hIndex - 1); input.value = shell.history[hIndex]; renderInput(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (hIndex === -1) return; hIndex++; if (hIndex >= shell.history.length) { hIndex = -1; input.value = draft; } else input.value = shell.history[hIndex]; renderInput(); return; }
    if (e.key === 'Escape' && !sugg.hidden) { e.stopPropagation(); hideSugg(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); shell.clear(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'c' && !window.getSelection().toString()) { e.preventDefault(); shell.push(h('div.c-dim', `❯ ${input.value}^C`)); input.value = ''; renderInput(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'u') { e.preventDefault(); input.value = input.value.slice(input.selectionStart); renderInput(); return; }
  });
  out.addEventListener('mouseup', () => { if (!window.getSelection().toString()) input.focus(); });
  head.addEventListener('dblclick', () => compact && window.__os.nav('terminal'));

  for (const n of shell.lines) out.append(n);
  const off = shell.subscribe((type, node) => {
    if (type === 'line') { out.append(node); scroll(); }
    else if (type === 'clear') clear(out);
    else if (type === 'state') renderPrompt();
  });
  const clock = setInterval(renderPrompt, 1000);
  renderPrompt(); renderInput(); scroll();
  shell.ready().then(() => { renderPrompt(); return welcome(); }).catch((e) => toast(e.message, 'error'));
  return {
    focus: () => input.focus(),
    run: (cmd) => execute(cmd),
    destroy() { off(); clearInterval(clock); cancelAnimationFrame(raf); },
  };
}
