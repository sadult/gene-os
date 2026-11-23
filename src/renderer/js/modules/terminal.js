// Terminal module: the full-size gsh window. Shares its session with the Home terminal widget.
import { mountTerminal } from '../terminal/view.js';
import { execute as run } from '../terminal/shell.js';

let term = null;
export const execute = (cmd) => run(cmd);

export default {
  id: 'terminal',
  mount(el) {
    term = mountTerminal(el, { compact: false });
    setTimeout(() => term && term.focus(), 30);
  },
  unmount() { if (term) term.destroy(); term = null; },
};
