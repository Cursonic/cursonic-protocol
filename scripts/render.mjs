// Pure page renderer shared by the build and the gates.
import { renderSocial, renderCA, projectAll } from '../src/js/register.js';

export function renderPage(template, register, tokensCss) {
  const rec = register.records;
  const theme = (/--bg:\s*(#[0-9a-fA-F]{6})/.exec(tokensCss) || [])[1] || '';
  const json = JSON.stringify({ records: projectAll(register) }).replace(/</g, '\\u003c');
  return template
    .replace('{{THEME}}', theme)
    .replace('{{SOCIAL_X}}', renderSocial('x', rec.x))
    .replace('{{SOCIAL_GITHUB}}', renderSocial('github', rec.github))
    .replace('{{CA_SLOT}}', renderCA(rec.ca))
    .replace('{{REGISTER_JSON}}', json);
}
