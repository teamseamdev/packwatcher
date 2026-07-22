import { createHash } from "node:crypto";

const challengeCode = process.argv[2];
const verificationToken = process.env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;
const endpoint = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT;

if (!challengeCode || !verificationToken || !endpoint) {
  console.error("Usage: EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN=... EBAY_ACCOUNT_DELETION_ENDPOINT=... node scripts/ebay-account-deletion-challenge.mjs <challenge_code>");
  process.exit(1);
}

const hash = createHash("sha256");
hash.update(challengeCode, "utf8");
hash.update(verificationToken, "utf8");
hash.update(endpoint, "utf8");

console.log(hash.digest("hex").toLowerCase());
