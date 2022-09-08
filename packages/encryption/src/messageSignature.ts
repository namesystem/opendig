import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@stacks/common';
import { decode, encode, encodingLength } from './varuint';

// 'Stacks Message Signing:\n'.length //  = 24
// 'Stacks Message Signing:\n'.length.toString(16) //  = 18
const chainPrefix: string = '\x18Stacks Message Signing:\n';

export function hashMessage(message: string, prefix: string = chainPrefix): Uint8Array {
  return sha256(encodeMessage(message, prefix));
}

export function encodeMessage(
  message: string | Uint8Array,
  prefix: string = chainPrefix
): Uint8Array {
  const messageBytes = typeof message == 'string' ? utf8ToBytes(message) : message;
  const encodedLength = encode(messageBytes.length);
  return concatBytes(utf8ToBytes(prefix), encodedLength, messageBytes);
}

export function decodeMessage(
  encodedMessage: Uint8Array,
  prefix: string = chainPrefix
): Uint8Array {
  // Remove the chain prefix: 1 for the varint and 24 for the length of the string
  // 'Stacks Message Signing:\n'
  const prefixByteLength = utf8ToBytes(prefix).byteLength;
  const messageWithoutChainPrefix = encodedMessage.subarray(prefixByteLength);
  const decoded = decode(messageWithoutChainPrefix);
  const varIntLength = encodingLength(decoded);
  // Remove the varint prefix
  return messageWithoutChainPrefix.slice(varIntLength);
}
