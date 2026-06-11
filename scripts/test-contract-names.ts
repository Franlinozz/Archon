import { contractNames } from "@/lib/source/solidity";
import { deriveContractName, isValidContractName } from "@/lib/source/names";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const commented = `// contract with arbitrary words should not be used
/* contract that also should not be used */
pragma solidity ^0.8.24;
interface IERC20 { function totalSupply() external view returns (uint256); }
contract LaunchToken is IERC20 { function totalSupply() external pure returns (uint256) { return 0; } }`;

assert(contractNames(commented)[0] === "LaunchToken", `expected primary contract LaunchToken, got ${contractNames(commented).join(",")}`);
assert(deriveContractName(commented, { label: "with" }) === "LaunchToken", "stopword label should be rejected in favor of AST-derived name");
assert(deriveContractName(commented, { label: "ReviewedToken" }) === "ReviewedToken", "valid user label should be preferred");
assert(!isValidContractName("with") && !isValidContractName("that") && !isValidContractName("is") && !isValidContractName("Never"), "public stopword/nonsense names must be rejected");
console.log("contract name derivation checks passed");
