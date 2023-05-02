module.exports = {
  '**/!(*test).{ts,json}': [
    'eslint --cache --fix',
    () => 'npm run bundle',
    () => 'git add dist/ lib/'
  ],
  '**/*.ts': () => 'tsc -p tsconfig.json',
  '**/*.{js,ts,json,md}': 'prettier --write'
};
