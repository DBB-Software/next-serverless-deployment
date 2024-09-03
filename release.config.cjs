/**
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', scope: '*', release: 'minor' },
          { type: 'bug', scope: '*', release: 'patch' },
          { type: 'chore', release: false },
          { breaking: true, release: 'major' }
        ],
        parserOpts: {
          headerPattern: /^(\w+)(?:\(([\w-]+)\))?:\s*(.*)$/,
          headerCorrespondence: ['type', 'scope', 'subject']
        }
      }
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        parserOpts: {
          headerPattern: /^(\w+)(?:\(([\w-]+)\))?:\s*(.*)$/,
          headerCorrespondence: ['type', 'scope', 'subject']
        }
      }
    ],
    [
      '@semantic-release/changelog',
      {
        changeLogFile: 'CHANGELOG.md'
      }
    ],
    [
      '@semantic-release/git',
      {
        assets: ['dist/', 'package.json', 'CHANGELOG.md'],
        message: 'chore: Release ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
      }
    ],
    '@semantic-release/github',
    '@semantic-release/npm'
  ],
  repositoryUrl: 'https://github.com/DBB-Software/next-serverless-deployment'
}
