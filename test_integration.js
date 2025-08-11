#!/usr/bin/env node

/**
 * Test script for CareerHunt Knowledge Graph Integration
 * This script tests the integration between the backend and Python knowledge graph
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🧪 Testing CareerHunt Knowledge Graph Integration...\n');

// Test 1: Check if Python scripts exist
console.log('1. Checking Python Knowledge Graph Scripts...');
const requiredFiles = ['build_kg.py', 'kg_manager.py'];
let allFilesExist = true;

for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file} - Found`);
  } else {
    console.log(`   ❌ ${file} - Missing`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing. Please ensure all Python scripts are present.');
  process.exit(1);
}

// Test 2: Check if sample data exists
console.log('\n2. Checking Sample Data...');
if (fs.existsSync('sample_jobs.csv')) {
  console.log('   ✅ sample_jobs.csv - Found');
} else {
  console.log('   ❌ sample_jobs.csv - Missing');
  console.log('   💡 Create this file with your job data to test the system');
}

// Test 3: Test Python environment
console.log('\n3. Testing Python Environment...');
try {
  const pythonVersion = spawn('python3', ['--version']);
  pythonVersion.stdout.on('data', (data) => {
    console.log(`   ✅ Python3: ${data.toString().trim()}`);
  });
  pythonVersion.stderr.on('data', (data) => {
    console.log(`   ❌ Python3 error: ${data.toString().trim()}`);
  });
} catch (error) {
  console.log('   ❌ Python3 not found or not accessible');
}

// Test 4: Check backend integration files
console.log('\n4. Checking Backend Integration...');
const backendFiles = [
  'backend/utils/resumeParser.js',
  'backend/utils/kgIntegration.js',
  'backend/controllers/skillController.js',
  'backend/routes/skillRoutes.js',
  'backend/models/skillSchema.js'
];

let backendFilesExist = true;
for (const file of backendFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file} - Found`);
  } else {
    console.log(`   ❌ ${file} - Missing`);
    backendFilesExist = false;
  }
}

if (!backendFilesExist) {
  console.log('\n❌ Some backend integration files are missing.');
  console.log('   💡 Make sure you have the complete backend structure');
}

// Test 5: Check dependencies
console.log('\n5. Checking Dependencies...');
if (fs.existsSync('requirements.txt')) {
  console.log('   ✅ requirements.txt - Found');
  const requirements = fs.readFileSync('requirements.txt', 'utf8');
  const packages = requirements.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  console.log(`   📦 ${packages.length} Python packages required`);
} else {
  console.log('   ❌ requirements.txt - Missing');
}

if (fs.existsSync('backend/package.json')) {
  console.log('   ✅ backend/package.json - Found');
} else {
  console.log('   ❌ backend/package.json - Missing');
}

// Test 6: Knowledge Graph Status
console.log('\n6. Checking Knowledge Graph Status...');
const kgFiles = ['careerhunt_kg.gpickle', 'embeddings.json'];
let kgExists = false;

for (const file of kgFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file} - Found (Knowledge Graph exists)`);
    kgExists = true;
  }
}

if (!kgExists) {
  console.log('   ⚠️  Knowledge Graph files not found');
  console.log('   💡 Run "python build_kg.py" to create the initial knowledge graph');
}

// Summary
console.log('\n📋 Integration Test Summary');
console.log('============================');

if (allFilesExist && backendFilesExist) {
  console.log('✅ All required files are present');
  console.log('✅ Backend integration is set up');
  
  if (kgExists) {
    console.log('✅ Knowledge Graph is ready');
    console.log('\n🚀 Your CareerHunt Knowledge Graph system is ready to use!');
    console.log('\nNext steps:');
    console.log('1. Start your backend server: cd backend && npm start');
    console.log('2. Test resume uploads through your webapp');
    console.log('3. Monitor skill extraction and knowledge graph updates');
  } else {
    console.log('⚠️  Knowledge Graph needs initialization');
    console.log('\nNext steps:');
    console.log('1. Create a jobs.csv file with your job data');
    console.log('2. Run: python build_kg.py');
    console.log('3. Start your backend server');
  }
} else {
  console.log('❌ Some components are missing');
  console.log('\nPlease ensure all required files are present before proceeding');
}

console.log('\n📚 For detailed setup instructions, see README.md');
console.log('🔧 For troubleshooting, check the logs and error messages above\n'); 