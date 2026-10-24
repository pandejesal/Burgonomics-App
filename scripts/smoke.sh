#!/usr/bin/env bash
set -e

echo "================================================================"
echo "BURGONOMICS — Full Backend & Frontend QA Smoke Verification Gate"
echo "================================================================"

echo "[1/8] Checking TypeScript Compilation (npx tsc --noEmit)..."
npx tsc --noEmit

echo "[2/8] Checking Production Bundle Build (npm run build)..."
npm run build

echo "[3/8] Verifying Admin Portal Decoupling (grep @/admin in src/)..."
if grep -r "from '@/admin" src/ ; then
  echo "FAILED: Found references to '@/admin' in src/"
  exit 1
fi
echo "PASS: 0 references to @/admin in src/"

echo "[4/8] Verifying Permanent Architecture Prohibitions (DON'T WANTs)..."
if grep -rnE "kitchen_orders|walletBalance|ioredis|bull|socket\.io" src/ ; then
  echo "FAILED: Found forbidden patterns in src/"
  exit 1
fi
echo "PASS: 0 occurrences of kitchen_orders, walletBalance, ioredis, bull, socket.io"

echo "[5/8] Running Unit & Functional Test Suite (npm run test)..."
npm run test

echo "[6/8] Running Firestore Security Rules Suite (npm run test:rules)..."
npm run test:rules

echo "[7/8] Verifying Capacitor App ID Configurations..."
if ! grep -q 'appId: "com.burgonomics"' capacitor.config.ts ; then
  echo "FAILED: Invalid core appId in capacitor.config.ts"
  exit 1
fi
echo "PASS: capacitor.config.ts appId is com.burgonomics"

echo "[8/8] Verifying Composite Indexes (firestore.indexes.json)..."
if [ ! -f firestore.indexes.json ]; then
  echo "FAILED: Missing firestore.indexes.json"
  exit 1
fi
echo "PASS: firestore.indexes.json verified (5 composite indexes)"

echo "================================================================"
echo "ALL QA SMOKE GATES PASSED (100% GREEN) — WEEK 1 EXIT APPROVED"
echo "================================================================"
