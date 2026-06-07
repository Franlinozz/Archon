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

## Empirical receipt comparison — measured mode rejected

Date: 2026-06-07

Mantle receipt ground truth was checked with `eth_getTransactionReceipt`. The exact receipt field for charged DA/L1 fee is `l1Fee`.

`getL1Fee(bytes)` was called at each transaction's block using the signed serialized transaction bytes.

| Tx | Block | Serialized bytes | Actual receipt `l1Fee` | Oracle `getL1Fee(serializedTx)` | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `0x82d99588e5f1bff33d618743025d598445493032637de25844a67aa8e88088ef` | `96205628` | `342` | `699231354481640` wei (`0.00069923135448164` MNT) | `313344079825` wei (`0.000000313344079825` MNT) | `99.9551%` |
| `0xb9ce87de86b212b91eb64012bbdab91014373da1f6d960470b340e1991a1a7c5` | `96205472` | `2037` | `6874261528561290` wei (`0.00687426152856129` MNT) | `2361496520609` wei (`0.000002361496520609` MNT) | `99.9656%` |

Receipt fee-related fields observed include:

- `l1Fee`
- `l1GasUsed`
- `l1GasPrice`
- `l1BaseFeeScalar`
- `l1BlobBaseFee`
- `l1BlobBaseFeeScalar`
- `blobGasUsed`
- `daFootprintGasScalar`
- `operatorFeeConstant`
- `operatorFeeScalar`

Conclusion: `0x420000000000000000000000000000000000000F.getL1Fee(bytes)` does **not** match Mantle Mainnet receipt ground truth for these production transactions. Archon must remain in labeled deterministic estimate mode until Mantle's current receipt-fee formula is implemented and validated against receipts.

## Receipt-calibrated model — active for pre-deployment estimates

Date: 2026-06-07

Archon does not use `GasPriceOracle.getL1Fee(bytes)` for measured mode. Production ground truth is the Mantle receipt `l1Fee` field.

### Real/deployed transactions

Where a real transaction exists, Archon treats `eth_getTransactionReceipt(txHash).l1Fee` as the measured DA/L1 cost and uses it directly.

### Pre-deployment estimates

For bytecode/calldata that does not yet have a receipt, Archon calibrates a zero/nonzero calldata-byte model from recent known receipts:

```text
estimated_l1_fee = zero_bytes * zeroByteFeeWei + nonzero_bytes * nonZeroByteFeeWei
```

Initial calibration samples:

- `0x82d99588e5f1bff33d618743025d598445493032637de25844a67aa8e88088ef`
- `0xb9ce87de86b212b91eb64012bbdab91014373da1f6d960470b340e1991a1a7c5`

Initial calibrated rates:

- `zeroByteFeeWei = 2736708878864`
- `nonZeroByteFeeWei = 3545974793924`

These rates are intentionally receipt-derived and can be refreshed by setting `ARCHON_DA_CALIBRATION_TXS` to a comma-separated set of recent Mantle transaction hashes.

### Validation

| Tx | Actual receipt `l1Fee` | Calibrated model prediction | Error |
| --- | ---: | ---: | ---: |
| `0x82d99588e5f1bff33d618743025d598445493032637de25844a67aa8e88088ef` | `699231354481640` wei | `699231354481572` wei | `<0.0001%` |
| `0xb9ce87de86b212b91eb64012bbdab91014373da1f6d960470b340e1991a1a7c5` | `6874261528561290` wei | `6874261528560500` wei | `<0.0001%` |

Mode enabled: `calibrated-receipts` for pre-deployment estimates when validation max error is below `10%`. The legacy oracle remains rejected for measured DA cost.
