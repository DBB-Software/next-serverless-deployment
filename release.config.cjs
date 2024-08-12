/**
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    [
      '@semantic-release/git',
      {
        assets: ['dist/', 'package.json', 'CHANGELOG.md']
      }
    ],
    '@semantic-release/github'
  ],
  repositoryUrl: 'https://github.com/DBB-Software/next-serverless-deployment'
}
