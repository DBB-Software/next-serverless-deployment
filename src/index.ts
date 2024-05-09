#!/usr/bin/env node

import { buildApp } from './build'

const command = process.argv[2]

if (command === 'build') {
  buildApp()
}
