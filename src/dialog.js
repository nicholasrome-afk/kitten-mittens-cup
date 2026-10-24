// Native browser confirms are unreliable in embedded previews. A real <dialog>
// provides a keyboard-accessible review step and exact-text destructive checks.
export function requestConfirmation({ title, body, phrase = null, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'confirmation-dialog';
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    const form = document.createElement('form');
    form.method = 'dialog';
    const heading = document.createElement('h2');
    heading.id = 'dialog-title'; heading.textContent = title;
    const description = document.createElement('p');
    description.textContent = body;
    form.append(heading, description);
    let field;
    if (phrase) {
      const label = document.createElement('label');
      label.textContent = `Type ${phrase} to confirm`;
      field = document.createElement('input');
      field.autocomplete = 'off'; field.spellcheck = false;
      label.append(field); form.append(label);
    }
    const buttons = document.createElement('div');
    buttons.className = 'button-row';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => dialog.close('cancel'));
    const approve = document.createElement('button');
    approve.type = 'submit'; approve.value = 'approve'; approve.textContent = confirmLabel;
    approve.className = danger ? 'danger' : 'primary';
    approve.disabled = Boolean(phrase);
    if (field) field.addEventListener('input', () => { approve.disabled = field.value !== phrase; });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!phrase || field.value === phrase) dialog.close('approve');
    });
    buttons.append(cancel, approve); form.append(buttons); dialog.append(form);
    dialog.addEventListener('close', () => {
      const approved = dialog.returnValue === 'approve';
      dialog.remove(); previousFocus?.focus();
      resolve(approved ? phrase || true : null);
    }, { once: true });
    document.body.append(dialog); dialog.showModal();
    (field || cancel).focus();
  });
}
