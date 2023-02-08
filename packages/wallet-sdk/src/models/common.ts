import { getPublicKeyFromPrivate, publicKeyToBtcAddress } from '@stacks/encryption';
// https://github.com/paulmillr/scure-bip32
// Secure, audited & minimal implementation of BIP32 hierarchical deterministic (HD) wallets.
import { HDKey } from '@scure/bip32';
import { Profile } from '@stacks/profile';

export interface Account {
  /** The private key used for STX payments */
  stxPrivateKey: string;
  /** The private key used in Stacks 1.0 to register BNS names */
  dataPrivateKey: string;
  /** The salt is the same as the wallet-level salt. Used for app-specific keys */
  salt: string;
  /** A single username registered via BNS for this account */
  username?: string;
  /** A profile object that is publicly associated with this account's username */
  profile?: Profile;
  /** The root of the keychain used to generate app-specific keys */
  appsKey: string;
  /** The index of this account in the user's wallet */
  index: number;
}

// Reference:  https://github.com/bitcoinjs/bip32/blob/79c6dedb3edfdc8505fe74d9f34c115c33e8a2da/ts-src/bip32.ts#L102
// Used to replicate deriveHardened bip32 method using deriveChild of scure-bip32 to offload old bip32 library
export const HARDENED_OFFSET = 0x80_00_00_00;

/**
 * This object represents the keys that were derived from the root-level
 * keychain of a wallet.
 */
export interface WalletKeys {
  /** Used when generating app private keys, which encrypt app-specific data */
  salt: string;
  /** The private key associated with the root of a BIP39 keychain */
  rootKey: string;
  /** A private key used to encrypt configuration data */
  configPrivateKey: string;
}

export interface Wallet extends WalletKeys {
  /** The encrypted secret key */
  encryptedSecretKey: string;
  /** A list of accounts generated by this wallet */
  accounts: Account[];
}

export const getGaiaAddress = (account: Account) => {
  const publicKey = getPublicKeyFromPrivate(account.dataPrivateKey);
  const address = publicKeyToBtcAddress(publicKey);
  return address;
};

export const getRootNode = (wallet: Wallet) => {
  return HDKey.fromExtendedKey(wallet.rootKey);
};
