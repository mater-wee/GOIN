// Checks the sign-in signature verification against the official SEP-53 test
// vectors (https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md).
// Usage: npm run test:sep53
import { decodeSignature, verifySep53 } from "../src/auth.ts";

const address = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";
const cases = [
  { message: "Hello, World!", sig: "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==", expect: true },
  { message: "こんにちは、世界！", sig: "083536eb95ecf32dce59b07fe7a1fd8cf814b2ce46f40d2a16e4ea1f6cecd980e04e6fbef9d21f98011c785a81edb85f3776a6e7d942b435eb0adc07da4d4604", expect: true },
  { message: "Hello, World?", sig: "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==", expect: false },
];

let failed = 0;
for (const c of cases) {
  const sig = decodeSignature(c.sig);
  const ok = !!sig && verifySep53(address, c.message, sig);
  const pass = ok === c.expect;
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  "${c.message}" -> verified=${ok} (expected ${c.expect})`);
}
process.exit(failed ? 1 : 0);
