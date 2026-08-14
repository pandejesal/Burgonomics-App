const { normalizeIndianPhone } = require('../functions/lib/auth/routes');
const { hashOtp } = require('../functions/lib/auth/smsProvider');
const crypto = require('crypto');

console.log("=== RUNNING AUTH VERIFICATION SUITE ===");

// 1. Phone Normalization Tests
console.log("\n[Test 1] Phone Normalization:");
const testCases = [
  { input: "9876543210", expected: "+919876543210" },
  { input: "+919876543210", expected: "+919876543210" },
  { input: "919876543210", expected: "+919876543210" },
  { input: "98765 43210", expected: "+919876543210" },
  { input: "+91 98765-43210", expected: "+919876543210" },
  { input: "12345", expected: null },
  { input: "1876543210", expected: null },
  { input: "abcdefghij", expected: null },
];

let normPassed = 0;
for (const tc of testCases) {
  const result = normalizeIndianPhone(tc.input);
  if (result === tc.expected) {
    console.log("  ✓ " + JSON.stringify(tc.input) + " → " + result);
    normPassed++;
  } else {
    console.error("  ✗ " + JSON.stringify(tc.input) + " → expected " + tc.expected + ", got " + result);
  }
}
console.log("  Summary: " + normPassed + "/" + testCases.length + " phone normalization tests passed.");

// 2. Cryptographic Salt & Hash Verification
console.log("\n[Test 2] OTP Hashing & Verification:");
const testCode = "741852";
const salt = crypto.randomBytes(16).toString("hex");
const hashed = hashOtp(testCode, salt);

const validAttemptHash = hashOtp("741852", salt);
const invalidAttemptHash = hashOtp("123456", salt);

const isValidMatch = crypto.timingSafeEqual(Buffer.from(hashed, "utf8"), Buffer.from(validAttemptHash, "utf8"));
const isInvalidMatch = crypto.timingSafeEqual(Buffer.from(hashed, "utf8"), Buffer.from(invalidAttemptHash, "utf8"));

if (isValidMatch && !isInvalidMatch) {
  console.log("  ✓ Valid code produces matching SHA-256 digest.");
  console.log("  ✓ Invalid code fails constant-time comparison.");
} else {
  console.error("  ✗ Hashing verification failed.");
}

console.log("\n=== ALL AUTH VERIFICATIONS COMPLETE ===");
