// A failed module import must produce a useful message, not an endless spinner.
const root = document.querySelector('#app') || document.querySelector('#admin-app');
const entry = root?.id === 'admin-app' ? './commissioner.js' : './app.js';

import(entry).catch(error => {
  if (!root) return;
  root.setAttribute('aria-busy', 'false');
  const panel = document.createElement('section');
  panel.className = 'error-panel';
  panel.setAttribute('role', 'alert');
  const title = document.createElement('h1');
  title.textContent = 'The website’s files could not load.';
  const explanation = document.createElement('p');
  explanation.textContent = 'The local preview server may be running an older version. Your saved tournament data has not been changed.';
  const instruction = document.createElement('p');
  instruction.textContent = 'In the Terminal running this website, press Control + C, run npm run dev again, then click Reload below.';
  const retry = document.createElement('button');
  retry.className = 'primary';
  retry.textContent = 'Reload website';
  retry.addEventListener('click', () => location.reload());
  const details = document.createElement('details');
  details.style.marginTop = '20px';
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  const message = document.createElement('p');
  message.textContent = error.message;
  details.append(summary, message);
  panel.append(title, explanation, instruction, retry, details);
  root.replaceChildren(panel);
});
