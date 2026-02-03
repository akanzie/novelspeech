#!/usr/bin/env node

import fs from 'fs-extra';
import { execSync } from 'child_process';
import path from 'path';

async function buildExtension() {
  console.log('📦 Building Story Reader Extension...');

  // Tạo thư mục dist
  await fs.ensureDir('dist');

  // Copy các file cần thiết
  const filesToCopy = [
    'manifest.json',
    'assets/',
    'core/',
    'content/',
    'background/',
    'ui/',
    'utils/',
    'libs/',
    'database/'
  ];

  for (const file of filesToCopy) {
    await fs.copy(file, `dist/${file}`);
  }

  // Minify các file JS (nếu cần)
  // execSync('uglifyjs ...');

  console.log('✅ Build completed!');
}

buildExtension().catch(console.error);
