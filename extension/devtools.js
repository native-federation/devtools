// DevTools bootstrap — plain JavaScript, kept outside the Angular build.
// Registers the Native Federation panel. The DevTools theme is passed to
// the panel page as a query parameter so the panel itself never touches
// chrome.* — it reads the theme as a plain web input at bootstrap.
const theme = chrome.devtools.panels.themeName === 'dark' ? 'dark' : 'light';
chrome.devtools.panels.create(
  'Native Federation',
  'icons/icon-32.png',
  `panel/index.html?theme=${theme}`,
  () => {},
);
