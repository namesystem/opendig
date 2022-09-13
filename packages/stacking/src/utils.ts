import { bech32, bech32m } from '@scure/base';
import { bigIntToBytes, concatBytes, hexToBytes } from '@stacks/common';
import { base58CheckDecode, base58CheckEncode } from '@stacks/encryption';
import {
  bufferCV,
  BufferCV,
  ClarityType,
  ClarityValue,
  tupleCV,
  TupleCV,
} from '@stacks/transactions';
import { PoXAddressVersion, StackingErrors } from './constants';

export class InvalidAddressError extends Error {
  innerError?: Error;
  constructor(address: string, innerError?: Error) {
    const msg = `'${address}' is not a valid P2PKH/P2SH/P2WPKH/P2WSH/P2TR address`;
    super(msg);
    this.message = msg;
    this.name = this.constructor.name;
    this.innerError = innerError;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export const BitcoinNetworkVersion = {
  mainnet: {
    P2PKH: 0x00, // 0
    P2SH: 0x05, // 5
  },
  testnet: {
    P2PKH: 0x6f, // 111
    P2SH: 0xc4, // 196
  },
} as const;

/** @ignore */
export function btcAddressVersionToLegacyHashMode(btcAddressVersion: number): PoXAddressVersion {
  switch (btcAddressVersion) {
    case BitcoinNetworkVersion.mainnet.P2PKH:
      return PoXAddressVersion.P2PKH;
    case BitcoinNetworkVersion.testnet.P2PKH:
      return PoXAddressVersion.P2PKH;
    case BitcoinNetworkVersion.mainnet.P2SH:
      return PoXAddressVersion.P2SH;
    case BitcoinNetworkVersion.testnet.P2SH:
      return PoXAddressVersion.P2SH;
    default:
      throw new Error('Invalid pox address version');
  }
}

type SupportedNativeByteLength = 20 | 32;

/** @ignore */
function nativeAddressToSegwitVersion(
  witnessVersion: number,
  dataLength: SupportedNativeByteLength
): PoXAddressVersion {
  switch ([witnessVersion, dataLength]) {
    case [0, 20]:
      return PoXAddressVersion.NativeP2WPKH;
    case [0, 32]:
      return PoXAddressVersion.NativeP2WSH;
    case [1, 32]:
      return PoXAddressVersion.NativeP2TR;
    default:
      throw new Error(
        'Invalid native segwit witness version and byte length. Currently, only P2WPKH, P2WSH, and P2TR are supported.'
      );
  }
}

/** @ignore */
export function getAddressVersion(btcAddress: string) {
  try {
    const { version } = base58CheckDecode(btcAddress);
    return btcAddressVersionToLegacyHashMode(version);
  } catch (error: any) {
    throw new InvalidAddressError(btcAddress, error);
  }
}

function bech32Decode(btcAddress: string) {
  const { words: bech32Words } = bech32.decode(btcAddress);
  const witnessVersion = bech32Words[0];

  if (witnessVersion > 0)
    throw new Error('Addresses with a witness version >= 1 should be encoded in bech32m');

  return {
    witnessVersion,
    data: Uint8Array.from(bech32.fromWords(bech32Words.slice(1))),
  };
}

function bech32MDecode(btcAddress: string) {
  const { words: bech32MWords } = bech32m.decode(btcAddress);
  const witnessVersion = bech32MWords[0];

  if (witnessVersion == 0)
    throw new Error('Addresses with witness version 1 should be encoded in bech32');

  return {
    witnessVersion,
    data: Uint8Array.from(bech32m.fromWords(bech32MWords.slice(1))),
  };
}

function nativeSegwitDecode(btcAddress: string): { witnessVersion: number; data: Uint8Array } {
  try {
    return bech32Decode(btcAddress);
  } catch (_) {}
  try {
    return bech32MDecode(btcAddress);
  } catch (e) {
    throw new Error(`'${btcAddress}' is not a valid bech32/bech32m address`);
  }
}

export function decodeBtcAddress(btcAddress: string): {
  version: PoXAddressVersion;
  data: Uint8Array;
} {
  try {
    const b58 = base58CheckDecode(btcAddress);
    const addressVersion = btcAddressVersionToLegacyHashMode(b58.version);
    return {
      version: addressVersion,
      data: b58.hash,
    };
  } catch (_) {}

  try {
    const b32 = nativeSegwitDecode(btcAddress);
    const addressVersion = nativeAddressToSegwitVersion(
      b32.witnessVersion,
      b32.data.length as SupportedNativeByteLength
    );
    return {
      version: addressVersion,
      data: b32.data,
    };
  } catch (innerError) {
    throw new InvalidAddressError(btcAddress, innerError as Error);
  }
}

export function extractPoxAddressFromClarityValue(poxAddrClarityValue: ClarityValue) {
  const clarityValue = poxAddrClarityValue as TupleCV;
  if (clarityValue.type !== ClarityType.Tuple || !clarityValue.data) {
    throw new Error('Invalid argument, expected ClarityValue to be a TupleCV');
  }
  if (!('version' in clarityValue.data) || !('hashbytes' in clarityValue.data)) {
    throw new Error(
      'Invalid argument, expected Clarity tuple value to contain `version` and `hashbytes` keys'
    );
  }
  const versionCV = clarityValue.data['version'] as BufferCV;
  const hashBytesCV = clarityValue.data['hashbytes'] as BufferCV;
  if (versionCV.type !== ClarityType.Buffer || hashBytesCV.type !== ClarityType.Buffer) {
    throw new Error(
      'Invalid argument, expected Clarity tuple value to contain `version` and `hashbytes` buffers'
    );
  }
  return {
    version: versionCV.buffer,
    hashBytes: hashBytesCV.buffer,
  };
}

export function getBTCAddress(version: number | Uint8Array, checksum: Uint8Array) {
  const versionNumber: number = typeof version === 'number' ? version : version[0];
  return base58CheckEncode(versionNumber, checksum);
}

export function getErrorString(error: StackingErrors): string {
  switch (error) {
    case StackingErrors.ERR_STACKING_UNREACHABLE:
      return 'Stacking unreachable';
    case StackingErrors.ERR_STACKING_INSUFFICIENT_FUNDS:
      return 'Insufficient funds';
    case StackingErrors.ERR_STACKING_INVALID_LOCK_PERIOD:
      return 'Invalid lock period';
    case StackingErrors.ERR_STACKING_ALREADY_STACKED:
      return 'Account already stacked. Concurrent stacking not allowed.';
    case StackingErrors.ERR_STACKING_NO_SUCH_PRINCIPAL:
      return 'Principal does not exist';
    case StackingErrors.ERR_STACKING_EXPIRED:
      return 'Stacking expired';
    case StackingErrors.ERR_STACKING_STX_LOCKED:
      return 'STX balance is locked';
    case StackingErrors.ERR_STACKING_PERMISSION_DENIED:
      return 'Permission denied';
    case StackingErrors.ERR_STACKING_THRESHOLD_NOT_MET:
      return 'Stacking threshold not met';
    case StackingErrors.ERR_STACKING_POX_ADDRESS_IN_USE:
      return 'PoX address already in use';
    case StackingErrors.ERR_STACKING_INVALID_POX_ADDRESS:
      return 'Invalid PoX address';
    case StackingErrors.ERR_STACKING_ALREADY_REJECTED:
      return 'Stacking already rejected';
    case StackingErrors.ERR_STACKING_INVALID_AMOUNT:
      return 'Invalid amount';
    case StackingErrors.ERR_NOT_ALLOWED:
      return 'Stacking not allowed';
    case StackingErrors.ERR_STACKING_ALREADY_DELEGATED:
      return 'Already delegated';
    case StackingErrors.ERR_DELEGATION_EXPIRES_DURING_LOCK:
      return 'Delegation expires during lock period';
    case StackingErrors.ERR_DELEGATION_TOO_MUCH_LOCKED:
      return 'Delegation too much locked';
    case StackingErrors.ERR_DELEGATION_POX_ADDR_REQUIRED:
      return 'PoX address required for delegation';
    case StackingErrors.ERR_INVALID_START_BURN_HEIGHT:
      return 'Invalid start burn height';
  }
}
/** @ignore */
export function rightPad(array: Uint8Array, minLength: number) {
  if (array.length >= minLength) return array;
  return concatBytes(array, hexToBytes('00'.repeat(Math.max(0, minLength - array.length))));
}

export function poxAddressToTuple(poxAddress: string) {
  const { version, data } = decodeBtcAddress(poxAddress);
  const versionBuff = bufferCV(bigIntToBytes(BigInt(version), 1));
  const hashBuff = bufferCV(rightPad(data, 32));
  return tupleCV({
    version: versionBuff,
    hashbytes: hashBuff,
  });
}
