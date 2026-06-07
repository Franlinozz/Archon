# 0007 — Mantle gas oracle verification gate

Date: 2026-06-07

## Decision

Archon must not present Mantle DA/L1 fee as a measured on-chain value until the gas oracle address is explicitly confirmed by the human operator.

Default behavior is a deterministic calldata byte/data-gas estimate only. Measured `getL1Fee(bytes)` pricing is enabled only when both are set:

- `MANTLE_GAS_PRICE_ORACLE_ADDRESS=<confirmed address>`
- `ARCHON_MANTLE_GAS_ORACLE_CONFIRMED=true`

## Evidence collected

### Official Mantle docs

Source: <https://github.com/LayerE/Mantle-Docs/blob/main/Transaction%20Fees%20on%20L2.md>

The Mantle docs identify the GasPriceOracle predeploy at `0x420000000000000000000000000000000000000F` and say to call `GasPriceOracle.getL1Fee()` for L1 data-fee estimation.

Caveat: the same page contains stale wording about EigenDA going online in the future, so this source alone is not enough to claim current post-migration DA-fee semantics.

### Mantle V2 source

Source: <https://github.com/mantlenetworkio/mantle-v2/blob/e29d360904db5e5ec81888885f7b7250f8255895/packages/contracts-bedrock/contracts/L2/GasPriceOracle.sol>

The source marks the predeploy as `0x420000000000000000000000000000000000000F` and exposes:

- `getL1Fee(bytes)`
- `getL1GasUsed(bytes)`
- `l1BaseFee()`
- `overhead()`
- `scalar()`
- `decimals()`
- `tokenRatio()`

Formula in source:

```solidity
uint256 l1GasUsed = getL1GasUsed(_data);
uint256 l1Fee = l1GasUsed * l1BaseFee();
uint256 divisor = 10**DECIMALS;
uint256 unscaled = l1Fee * scalar();
uint256 scaled = unscaled / divisor;
return scaled;
```

### Current DA context

Source: <https://www.mantle.xyz/blog/announcements/mantle-network-security-evolution-scalability-decentralization>

Mantle states it uses Mantle DA / EigenDA and remains committed to EigenDA. This means Archon should describe current DA/L1 pricing cautiously and avoid assuming OP-stack calldata economics without confirmation.

### Mainnet RPC verification

Checked against Mantle Mainnet RPC `https://rpc.mantle.xyz` on block `96356945`.

Address: `0x420000000000000000000000000000000000000F`

Observed:

- Bytecode exists: `2055` bytes
- `getL1Fee(0x1234567890abcdef0000)` returned `33163314533`
- `getL1GasUsed(0x1234567890abcdef0000)` returned `1600`
- `l1BaseFee()` returned `122631607`
- `overhead()` returned `188`
- `scalar()` returned `10000`
- `decimals()` returned `6`
- `tokenRatio()` returned `3035`

## Confidence

`candidate-verified-onchain`, not `human-confirmed`.

The address and ABI are strongly supported by official docs/source and live RPC, but measured DA-fee mode remains disabled until Francis explicitly confirms the address and semantics for Archon production.
