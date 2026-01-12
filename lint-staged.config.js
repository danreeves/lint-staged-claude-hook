export default {
  '*.js': ['eslint --fix', 'prettier --write'],
  '*.ts': ['tsc --noEmit', 'eslint --fix'],
}
