// @ts-ignore
import { IntegerType, intToBigInt } from '@stacks/common';
import { StacksNetwork } from '@stacks/network';
import {
  BurnchainRewardListResponse,
  BurnchainRewardSlotHolderListResponse,
  BurnchainRewardsTotal,
} from '@stacks/stacks-blockchain-api-types';
import {
  addressToString,
  AnchorMode,
  broadcastTransaction,
  BufferCV,
  callReadOnlyFunction,
  ClarityType,
  ClarityValue,
  ContractCallOptions,
  ContractCallPayload,
  cvToString,
  getFee,
  makeContractCall,
  noneCV,
  OptionalCV,
  PrincipalCV,
  ResponseErrorCV,
  someCV,
  StacksTransaction,
  standardPrincipalCV,
  TupleCV,
  TxBroadcastResult,
  uintCV,
  UIntCV,
  validateStacksAddress,
} from '@stacks/transactions';
import { PoxOperationPeriod, StackingErrors } from './constants';
import { ensurePox2IsLive, poxAddressToTuple, unwrap, unwrapMap } from './utils';
export * from './utils';

export interface CycleInfo {
  id: number;
  min_threshold_ustx: number;
  stacked_ustx: number;
  is_pox_active: boolean;
}

export interface ContractVersion {
  contract_id: string;
  activation_burnchain_block_height: number;
  first_reward_cycle_id: number;
}

export interface PoxInfo {
  contract_id: string;
  first_burnchain_block_height: number;
  min_amount_ustx: string;
  registration_window_length: 250;
  rejection_fraction: number;
  reward_cycle_id: number;
  reward_cycle_length: number;
  rejection_votes_left_required: number;
  current_cycle: CycleInfo;
  current_burnchain_block_height?: number;
  prepare_phase_block_length: number;
  reward_phase_block_length: number;
  contract_versions?: ContractVersion[];
}

export type PoxOperationInfo =
  | {
      period: PoxOperationPeriod.Period1 | PoxOperationPeriod.Period3;
    }
  | {
      period: PoxOperationPeriod.Period2;
      burnBlocksUntilPox2: number;
    };

export type StackerInfo =
  | {
      stacked: false;
    }
  | {
      stacked: true;
      details: {
        first_reward_cycle: number;
        lock_period: number;
        unlock_height: number;
        pox_address: {
          version: Uint8Array;
          hashbytes: Uint8Array;
        };
      };
    };

export type DelegationInfo =
  | {
      delegated: false;
    }
  | {
      delegated: true;
      details: {
        amount_micro_stx: bigint;
        delegated_to: string;
        pox_address:
          | {
              version: Uint8Array;
              hashbytes: Uint8Array;
            }
          | undefined;
        until_burn_ht: number | undefined;
      };
    };

export interface BlockTimeInfo {
  mainnet: {
    target_block_time: number;
  };
  testnet: {
    target_block_time: number;
  };
}

export interface CoreInfo {
  burn_block_height: number;
  stable_pox_consensus: string;
}

export interface BalanceInfo {
  balance: string;
  nonce: number;
}

export interface RewardsError {
  error: string;
}

export interface RewardOptions {
  limit: number;
  offset: number;
}

export interface StackingEligibility {
  eligible: boolean;
  reason?: string;
}

/**
 * Lock stx check options
 */
export interface CanLockStxOptions {
  /** the reward Bitcoin address */
  poxAddress: string;
  /** number of cycles to lock */
  cycles: number;
}

/**
 * Lock stx options
 */
export interface LockStxOptions {
  /** private key to sign transaction */
  privateKey: string;
  /** number of cycles to lock */
  cycles: number;
  /** the reward Bitcoin address */
  poxAddress: string;
  /** number of microstacks to lock */
  amountMicroStx: IntegerType;
  /** the burnchain block height to begin lock */
  burnBlockHeight: number;
}

/**
 * Stack extend stx options
 */
export interface StackExtendOptions {
  /** private key to sign transaction */
  privateKey: string;
  /** number of cycles to extend by */
  extendCycles: number;
  /** the reward Bitcoin address */
  poxAddress: string;
}

/**
 * Stack increase stx options
 */
export interface StackIncreaseOptions {
  /** private key to sign transaction */
  privateKey: string;
  /** number of ustx to increase by */
  increaseBy: IntegerType;
}

/**
 * Delegate stx options
 */
export interface DelegateStxOptions {
  /** number of microstacks to delegate */
  amountMicroStx: IntegerType;
  /** the STX address of the delegatee */
  delegateTo: string;
  /** the burnchain block height after which delegation is revoked */
  untilBurnBlockHeight?: number;
  /** the reward Bitcoin address of the delegator */
  poxAddress?: string;
  /** private key to sign transaction */
  privateKey: string;
}

/**
 * Delegate stack stx options
 */
export interface DelegateStackStxOptions {
  /** the STX address of the delegator */
  stacker: string;
  /** number of microstacks to lock */
  amountMicroStx: IntegerType;
  /** the reward Bitcoin address of the delegator */
  poxAddress: string;
  /** the burnchain block height to begin lock */
  burnBlockHeight: number;
  /** number of cycles to lock */
  cycles: number;
  /** private key to sign transaction */
  privateKey: string;
  /** nonce for the transaction */
  nonce?: IntegerType;
}

/**
 * Delegate stack extend options
 */
export interface DelegateStackExtendOptions {
  /** the STX address of the delegator */
  stacker: string;
  /** the reward Bitcoin address of the delegator */
  poxAddress: string;
  /** number of cycles to extend by */
  extendCount: number;
  /** private key to sign transaction */
  privateKey: string;
  /** nonce for the transaction */
  nonce?: IntegerType;
}

/**
 * Delegate stack increase options
 */
export interface DelegateStackIncreaseOptions {
  /** the STX address of the delegator */
  stacker: string;
  /** the reward Bitcoin address of the delegator */
  poxAddress: string;
  /** number of ustx to increase by */
  increaseBy: IntegerType;
  /** private key to sign transaction */
  privateKey: string;
  /** nonce for the transaction */
  nonce?: IntegerType;
}

export interface StackAggregationCommitOptions {
  poxAddress: string;
  rewardCycle: number;
  privateKey: string;
}

export class StackingClient {
  constructor(public address: string, public network: StacksNetwork) {}

  /**
   * Get stacks node info
   *
   * @returns {Promise<CoreInfo>} that resolves to a CoreInfo response if the operation succeeds
   */
  async getCoreInfo(): Promise<CoreInfo> {
    const url = this.network.getInfoUrl();
    return this.network.fetchFn(url).then(res => res.json());
  }

  /**
   * Get stacks node pox info
   *
   * @returns {Promise<PoxInfo>} that resolves to a PoxInfo response if the operation succeeds
   */
  async getPoxInfo(): Promise<PoxInfo> {
    const url = this.network.getPoxInfoUrl();
    return this.network.fetchFn(url).then(res => res.json());
  }

  /**
   * Get stacks node target block time
   *
   * @returns {Promise<number>} that resolves to a number if the operation succeeds
   */
  async getTargetBlockTime(): Promise<number> {
    const url = this.network.getBlockTimeInfoUrl();
    const res = await this.network.fetchFn(url).then(res => res.json());

    if (this.network.isMainnet()) {
      return res.mainnet.target_block_time;
    } else {
      return res.testnet.target_block_time;
    }
  }

  async getAccountStatus(): Promise<any> {
    const url = this.network.getAccountApiUrl(this.address);
    return this.network.fetchFn(url).then(res => res.json());
  }

  /**
   * Get account balance
   *
   * @returns promise resolves to a bigint if the operation succeeds
   */
  async getAccountBalance(): Promise<bigint> {
    return this.getAccountStatus().then(res => {
      return BigInt(res.balance);
    });
  }

  /**
   * Get account balance of locked tokens
   *
   * @returns promise resolves to a bigint if the operation succeeds
   */
  async getAccountBalanceLocked(): Promise<bigint> {
    return this.getAccountStatus().then(res => BigInt(res.locked));
  }

  /**
   * Get reward cycle duration in seconds
   *
   * @returns {Promise<number>} that resolves to a number if the operation succeeds
   */
  async getCycleDuration(): Promise<number> {
    const poxInfoPromise = this.getPoxInfo();
    const targetBlockTimePromise = await this.getTargetBlockTime();

    return Promise.all([poxInfoPromise, targetBlockTimePromise]).then(
      ([poxInfo, targetBlockTime]) => {
        return poxInfo.reward_cycle_length * targetBlockTime;
      }
    );
  }

  /**
   * Get the total burnchain rewards total for the set address
   *
   * @returns {Promise<TotalRewardsResponse | RewardsError>} that resolves to TotalRewardsResponse or RewardsError
   */
  async getRewardsTotalForBtcAddress(): Promise<BurnchainRewardsTotal | RewardsError> {
    const url = this.network.getRewardsTotalUrl(this.address);
    return this.network.fetchFn(url).then(res => res.json());
  }

  /**
   * Get burnchain rewards for the set address
   *
   * @returns {Promise<RewardsResponse | RewardsError>} that resolves to RewardsResponse or RewardsError
   */
  async getRewardsForBtcAddress(
    options?: RewardOptions
  ): Promise<BurnchainRewardListResponse | RewardsError> {
    const url = `${this.network.getRewardsUrl(this.address, options)}`;
    return this.network.fetchFn(url).then(res => res.json());
  }

  /**
   * Get burnchain rewards holders for the set address
   *
   * @returns {Promise<RewardHoldersResponse | RewardsError>} that resolves to RewardHoldersResponse or RewardsError
   */
  async getRewardHoldersForBtcAddress(
    options?: RewardOptions
  ): Promise<BurnchainRewardSlotHolderListResponse | RewardsError> {
    const url = `${this.network.getRewardHoldersUrl(this.address, options)}`;
    return this.network.fetchFn(url).then(res => res.json());
  }

  /**
   * Get number of seconds until next reward cycle
   *
   * @returns {Promise<number>} that resolves to a number if the operation succeeds
   */
  async getSecondsUntilNextCycle(): Promise<number> {
    const poxInfoPromise = this.getPoxInfo();
    const targetBlockTimePromise = this.getTargetBlockTime();
    const coreInfoPromise = this.getCoreInfo();

    return Promise.all([poxInfoPromise, targetBlockTimePromise, coreInfoPromise]).then(
      ([poxInfo, targetBlockTime, coreInfo]) => {
        const blocksToNextCycle =
          poxInfo.reward_cycle_length -
          ((coreInfo.burn_block_height - poxInfo.first_burnchain_block_height) %
            poxInfo.reward_cycle_length);
        return blocksToNextCycle * targetBlockTime;
      }
    );
  }

  /**
   * Get information on current PoX operation
   *
   * Periods:
   * - Period 1: This is before the 2.1 fork.
   * - Period 2: This is after the 2.1 fork, but before cycle (N+1).
   * - Period 3: This is after cycle (N+1) has begun. Original PoX contract state will no longer have any impact on reward sets, account lock status, etc.
   *
   * @returns {Promise<PoxOperationInfo>} that resolves to PoX operation info
   */
  async getPoxOperationInfo(poxInfo?: PoxInfo): Promise<PoxOperationInfo> {
    poxInfo = poxInfo ?? (await this.getPoxInfo());

    // == Before 2.1 ===========================================================
    // => Period 1
    if (
      !poxInfo.current_burnchain_block_height ||
      !poxInfo.contract_versions ||
      poxInfo.contract_versions.length <= 1
    ) {
      // Node does not know about other pox versions yet
      return { period: 1 };
    }

    const [pox1, pox2] = [...poxInfo.contract_versions].sort(
      (a, b) => a.activation_burnchain_block_height - b.activation_burnchain_block_height
    );
    const [address, name] = pox2.contract_id.split('.');
    const pox2ConfiguredUrl = this.network.getDataVarUrl(address, name, 'configured');
    const isPox2Configured =
      (await this.network.fetchFn(pox2ConfiguredUrl).then(r => r.text())) === '{"data":"0x03"}'; // PoX-2 is configured on fork
    const burnBlocksUntilPox2 =
      pox2.activation_burnchain_block_height - (poxInfo.current_burnchain_block_height as number);

    // => Period 1
    if (!isPox2Configured) {
      // Node hasn't forked yet (unclear if this case can happen)
      return { period: 1, burnBlocksUntilPox2 };
    }

    // == In 2.1 Fork ==========================================================
    // => Period 2
    if (poxInfo.contract_id === pox1.contract_id) {
      // In 2.1 fork, but PoX-2 hasn't been activated yet
      return { period: 2, burnBlocksUntilPox2 };
    }

    // => Period 3
    if (poxInfo.contract_id === pox2.contract_id) {
      // In 2.1 fork and PoX-2 is live
      return { period: 3 };
    }

    throw new Error('Could not determine PoX Operation Period');
  }

  /**
   * Check if stacking is enabled for next reward cycle
   *
   * @returns {Promise<boolean>} that resolves to a bool if the operation succeeds
   */
  async isStackingEnabledNextCycle(): Promise<boolean> {
    return (await this.getPoxInfo()).rejection_votes_left_required > 0;
  }

  /**
   * Check if account has minimum require amount of Stacks for stacking
   *
   * @returns {Promise<boolean>} that resolves to a bool if the operation succeeds
   */
  async hasMinimumStx(): Promise<boolean> {
    const balance = await this.getAccountBalance();
    const min = BigInt((await this.getPoxInfo()).min_amount_ustx);
    return balance >= min;
  }

  /**
   * Check if account can lock stx
   *
   * @param {CanLockStxOptions} options - a required lock STX options object
   *
   * @returns {Promise<StackingEligibility>} that resolves to a StackingEligibility object if the operation succeeds
   */
  async canStack({ poxAddress, cycles }: CanLockStxOptions): Promise<StackingEligibility> {
    const balancePromise: Promise<bigint> = this.getAccountBalance();
    const poxInfoPromise = this.getPoxInfo();

    return Promise.all([balancePromise, poxInfoPromise])
      .then(([balance, poxInfo]) => {
        const address = poxAddressToTuple(poxAddress);
        const [contractAddress, contractName] = this.parseContractId(poxInfo.contract_id);

        return callReadOnlyFunction({
          network: this.network,
          contractName,
          contractAddress,
          functionName: 'can-stack-stx',
          senderAddress: this.address,
          functionArgs: [
            address,
            uintCV(balance.toString()),
            uintCV(poxInfo.reward_cycle_id),
            uintCV(cycles.toString()),
          ],
        });
      })
      .then((responseCV: ClarityValue) => {
        if (responseCV.type === ClarityType.ResponseOk) {
          return {
            eligible: true,
          };
        } else {
          const errorCV = responseCV as ResponseErrorCV;
          return {
            eligible: false,
            reason: StackingErrors[+cvToString(errorCV.value)],
          };
        }
      });
  }

  /**
   * Generate and broadcast a stacking transaction to lock STX
   *
   * @param {LockStxOptions} options - a required lock STX options object
   *
   * @returns {Promise<string>} that resolves to a broadcasted txid if the operation succeeds
   */
  async stack({
    amountMicroStx,
    poxAddress,
    cycles,
    privateKey,
    burnBlockHeight,
  }: LockStxOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const contract = poxInfo.contract_id;

    const txOptions = this.getStackOptions({
      amountMicroStx,
      cycles,
      poxAddress,
      contract,
      burnBlockHeight,
    });
    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * Generate and broadcast a stacking transaction to extend locked STX (`pox-2.stack-extend`)
   * @category PoX-2
   * @param {StackExtendOptions} - a required extend STX options object
   * @returns a broadcasted txid if the operation succeeds
   */
  async stackExtend({
    extendCycles,
    poxAddress,
    privateKey,
  }: StackExtendOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const poxOperationInfo = await this.getPoxOperationInfo(poxInfo);
    ensurePox2IsLive(poxOperationInfo);

    const txOptions = this.getStackExtendOptions({
      contract: poxInfo.contract_id,
      extendCycles,
      poxAddress,
    });
    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * Generate and broadcast a stacking transaction to increase locked STX (`pox-2.stack-increase`)
   * @category PoX-2
   * @param {StackIncreaseOptions} - a required increase STX options object
   * @returns a broadcasted txid if the operation succeeds
   */
  async stackIncrease({
    increaseBy,
    privateKey,
  }: StackIncreaseOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const poxOperationInfo = await this.getPoxOperationInfo(poxInfo);
    ensurePox2IsLive(poxOperationInfo);

    const txOptions = this.getStackIncreaseOptions({
      contract: poxInfo.contract_id,
      increaseBy,
    });
    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * As a delegatee, generate and broadcast a transaction to create a delegation relationship
   *
   * @param {DelegateStxOptions} options - a required delegate STX options object
   *
   * @returns {Promise<string>} that resolves to a broadcasted txid if the operation succeeds
   */
  async delegateStx({
    amountMicroStx,
    delegateTo,
    untilBurnBlockHeight,
    poxAddress,
    privateKey,
  }: DelegateStxOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const contract = poxInfo.contract_id;

    const txOptions = this.getDelegateOptions({
      contract,
      amountMicroStx,
      delegateTo,
      untilBurnBlockHeight,
      poxAddress,
    });

    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * As a delegator, generate and broadcast transactions to stack for multiple delegatees. This will lock up tokens owned by the delegatees.
   *
   * @param {DelegateStackStxOptions} options - a required delegate stack STX options object
   *
   * @returns {Promise<string>} that resolves to a broadcasted txid if the operation succeeds
   */
  async delegateStackStx({
    stacker,
    amountMicroStx,
    poxAddress,
    burnBlockHeight,
    cycles,
    privateKey,
    nonce,
  }: DelegateStackStxOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const contract = poxInfo.contract_id;

    const txOptions = this.getDelegateStackOptions({
      contract,
      stacker,
      amountMicroStx,
      poxAddress,
      burnBlockHeight,
      cycles,
      nonce,
    });
    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * As a delegator, generate and broadcast transactions to extend stack for multiple delegatees.
   * @category PoX-2
   * @param {DelegateStackExtendOptions} options - a required delegate stack extend STX options object
   * @returns {Promise<string>} that resolves to a broadcasted txid if the operation succeeds
   */
  async delegateStackExtend({
    stacker,
    poxAddress,
    extendCount,
    privateKey,
    nonce,
  }: DelegateStackExtendOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const contract = poxInfo.contract_id;

    const txOptions = this.getDelegateStackExtendOptions({
      contract,
      stacker,
      poxAddress,
      extendCount,
      nonce,
    });
    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * As a delegator, generate and broadcast transactions to stack increase for multiple delegatees.
   * @category PoX-2
   * @param {DelegateStackIncreaseOptions} - a required delegate stack increase STX options object
   * @returns {Promise<string>} that resolves to a broadcasted txid if the operation succeeds
   */
  async delegateStackIncrease({
    stacker,
    poxAddress,
    increaseBy,
    privateKey,
    nonce,
  }: DelegateStackIncreaseOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const poxOperationInfo = await this.getPoxOperationInfo(poxInfo);
    ensurePox2IsLive(poxOperationInfo);

    const txOptions = this.getDelegateStackIncreaseOptions({
      contract: poxInfo.contract_id,
      stacker,
      poxAddress,
      increaseBy,
      nonce,
    });
    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * As a delegator, generate and broadcast a transaction to commit partially committed delegatee tokens
   *
   * @param {StackAggregationCommitOptions} options - a required stack aggregation commit options object
   *
   * @returns {Promise<string>} that resolves to a broadcasted txid if the operation succeeds
   */
  async stackAggregationCommit({
    poxAddress,
    rewardCycle,
    privateKey,
  }: StackAggregationCommitOptions): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const contract = poxInfo.contract_id;

    const txOptions = this.getStackAggregationCommitOptions({
      contract,
      poxAddress,
      rewardCycle,
    });
    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  /**
   * As a delegatee, generate and broadcast a transaction to terminate the delegation relationship
   *
   * @param {string} privateKey - the private key to be used for the revoke call
   *
   * @returns {Promise<string>} that resolves to a broadcasted txid if the operation succeeds
   */
  async revokeDelegateStx(privateKey: string): Promise<TxBroadcastResult> {
    const poxInfo = await this.getPoxInfo();
    const contract = poxInfo.contract_id;

    const txOptions = this.getRevokeDelegateStxOptions(contract);

    const tx = await makeContractCall({
      ...txOptions,
      senderKey: privateKey,
    });

    return broadcastTransaction(tx, txOptions.network as StacksNetwork);
  }

  getStackOptions({
    amountMicroStx,
    poxAddress,
    cycles,
    contract,
    burnBlockHeight,
  }: {
    cycles: number;
    poxAddress: string;
    amountMicroStx: IntegerType;
    contract: string;
    burnBlockHeight: number;
  }) {
    const address = poxAddressToTuple(poxAddress);
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'stack-stx',
      // sum of uStx, address, burn_block_height, num_cycles
      functionArgs: [uintCV(amountMicroStx), address, uintCV(burnBlockHeight), uintCV(cycles)],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };
    return txOptions;
  }

  getStackExtendOptions({
    extendCycles,
    poxAddress,
    contract,
  }: {
    extendCycles: number;
    poxAddress: string;
    contract: string;
  }) {
    const address = poxAddressToTuple(poxAddress);
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'stack-extend',
      functionArgs: [uintCV(extendCycles), address],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };
    return txOptions;
  }

  getStackIncreaseOptions({ increaseBy, contract }: { increaseBy: IntegerType; contract: string }) {
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'stack-increase',
      functionArgs: [uintCV(increaseBy)],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };
    return txOptions;
  }

  getDelegateOptions({
    contract,
    amountMicroStx,
    delegateTo,
    untilBurnBlockHeight,
    poxAddress,
  }: {
    contract: string;
    amountMicroStx: IntegerType;
    delegateTo: string;
    untilBurnBlockHeight?: number;
    poxAddress?: string;
  }) {
    const address = poxAddress ? someCV(poxAddressToTuple(poxAddress)) : noneCV();
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'delegate-stx',
      functionArgs: [
        uintCV(amountMicroStx),
        standardPrincipalCV(delegateTo),
        untilBurnBlockHeight ? someCV(uintCV(untilBurnBlockHeight)) : noneCV(),
        address,
      ],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };
    return txOptions;
  }

  getDelegateStackOptions({
    contract,
    stacker,
    amountMicroStx,
    poxAddress,
    burnBlockHeight,
    cycles,
    nonce,
  }: {
    contract: string;
    stacker: string;
    amountMicroStx: IntegerType;
    poxAddress: string;
    burnBlockHeight: number;
    cycles: number;
    nonce?: IntegerType;
  }) {
    const address = poxAddressToTuple(poxAddress);
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'delegate-stack-stx',
      functionArgs: [
        standardPrincipalCV(stacker),
        uintCV(amountMicroStx),
        address,
        uintCV(burnBlockHeight),
        uintCV(cycles),
      ],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };

    if (nonce) {
      txOptions.nonce = nonce;
    }

    return txOptions;
  }

  getDelegateStackExtendOptions({
    contract,
    stacker,
    poxAddress,
    extendCount,
    nonce,
  }: {
    contract: string;
    stacker: string;
    poxAddress: string;
    extendCount: number;
    nonce?: IntegerType;
  }) {
    const address = poxAddressToTuple(poxAddress);
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'delegate-stack-extend',
      functionArgs: [standardPrincipalCV(stacker), address, uintCV(extendCount)],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };

    if (nonce) {
      txOptions.nonce = nonce;
    }

    return txOptions;
  }

  getDelegateStackIncreaseOptions({
    contract,
    stacker,
    poxAddress,
    increaseBy,
    nonce,
  }: {
    contract: string;
    stacker: string;
    poxAddress: string;
    increaseBy: IntegerType;
    nonce?: IntegerType;
  }) {
    const address = poxAddressToTuple(poxAddress);
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'delegate-stack-increase',
      functionArgs: [standardPrincipalCV(stacker), address, uintCV(increaseBy)],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };

    if (nonce) {
      txOptions.nonce = nonce;
    }

    return txOptions;
  }

  getStackAggregationCommitOptions({
    contract,
    poxAddress,
    rewardCycle,
  }: {
    contract: string;
    poxAddress: string;
    rewardCycle: number;
  }) {
    const address = poxAddressToTuple(poxAddress);
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'stack-aggregation-commit',
      functionArgs: [address, uintCV(rewardCycle)],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };
    return txOptions;
  }

  getRevokeDelegateStxOptions(contract: string) {
    const [contractAddress, contractName] = this.parseContractId(contract);
    const txOptions: ContractCallOptions = {
      contractAddress,
      contractName,
      functionName: 'revoke-delegate-stx',
      functionArgs: [],
      validateWithAbi: true,
      network: this.network,
      anchorMode: AnchorMode.Any,
    };
    return txOptions;
  }

  /**
   * Check stacking status
   *
   * @returns {Promise<StackerInfo>} that resolves to a StackerInfo object if the operation succeeds
   */
  async getStatus(): Promise<StackerInfo> {
    const poxInfo = await this.getPoxInfo();
    const [contractAddress, contractName] = this.parseContractId(poxInfo.contract_id);
    const account = await this.getAccountStatus();
    const functionName = 'get-stacker-info';

    return callReadOnlyFunction({
      contractAddress,
      contractName,
      functionName,
      senderAddress: this.address,
      functionArgs: [standardPrincipalCV(this.address)],
      network: this.network,
    }).then((responseCV: ClarityValue) => {
      if (responseCV.type === ClarityType.OptionalSome) {
        const someCV = responseCV;
        const tupleCV: TupleCV = someCV.value as TupleCV;
        const poxAddress: TupleCV = tupleCV.data['pox-addr'] as TupleCV;
        const firstRewardCycle: UIntCV = tupleCV.data['first-reward-cycle'] as UIntCV;
        const lockPeriod: UIntCV = tupleCV.data['lock-period'] as UIntCV;
        const version: BufferCV = poxAddress.data['version'] as BufferCV;
        const hashbytes: BufferCV = poxAddress.data['hashbytes'] as BufferCV;

        return {
          stacked: true,
          details: {
            first_reward_cycle: Number(firstRewardCycle.value),
            lock_period: Number(lockPeriod.value),
            unlock_height: account.unlock_height,
            pox_address: {
              version: version.buffer,
              hashbytes: hashbytes.buffer,
            },
          },
        };
      } else if (responseCV.type === ClarityType.OptionalNone) {
        return {
          stacked: false,
        };
      } else {
        throw new Error(`Error fetching stacker info`);
      }
    });
  }

  /**
   * Check delegation status
   *
   * @returns {Promise<DelegationInfo>} that resolves to a DelegationInfo object if the operation succeeds
   */
  async getDelegationStatus(): Promise<DelegationInfo> {
    const poxInfo = await this.getPoxInfo();
    const [contractAddress, contractName] = this.parseContractId(poxInfo.contract_id);
    const functionName = 'get-delegation-info';

    return callReadOnlyFunction({
      contractAddress,
      contractName,
      functionName,
      senderAddress: this.address,
      functionArgs: [standardPrincipalCV(this.address)],
      network: this.network,
    }).then((responseCV: ClarityValue) => {
      if (responseCV.type === ClarityType.OptionalSome) {
        const tupleCV = responseCV.value as TupleCV;
        const amountMicroStx = tupleCV.data['amount-ustx'] as UIntCV;
        const delegatedTo = tupleCV.data['delegated-to'] as PrincipalCV;

        const poxAddress = unwrapMap(tupleCV.data['pox-addr'] as OptionalCV<TupleCV>, tuple => ({
          version: (tuple.data['version'] as BufferCV).buffer,
          hashbytes: (tuple.data['hashbytes'] as BufferCV).buffer,
        }));

        const untilBurnBlockHeight = unwrap(tupleCV.data['until-burn-ht'] as OptionalCV<UIntCV>);

        return {
          delegated: true,
          details: {
            amount_micro_stx: BigInt(amountMicroStx.value),
            delegated_to: addressToString(delegatedTo.address),
            pox_address: poxAddress,
            until_burn_ht: Number(untilBurnBlockHeight?.value),
          },
        };
      } else if (responseCV.type === ClarityType.OptionalNone) {
        return {
          delegated: false,
        };
      } else {
        throw new Error(`Error fetching delegation info`);
      }
    });
  }

  /**
   * Adjust microstacks amount for locking after taking into account transaction fees
   *
   * @returns {StacksTransaction} that resolves to a transaction object if the operation succeeds
   */
  modifyLockTxFee({ tx, amountMicroStx }: { tx: StacksTransaction; amountMicroStx: IntegerType }) {
    const fee = getFee(tx.auth);
    (tx.payload as ContractCallPayload).functionArgs[0] = uintCV(
      intToBigInt(amountMicroStx, false) - fee
    );
    return tx;
  }

  /**
   * Parses a contract identifier and ensures it is formatted correctly
   *
   * @returns {Array<string>} a contract address and name
   */
  parseContractId(contract: string): string[] {
    const parts = contract.split('.');

    if (
      parts.length === 2 &&
      validateStacksAddress(parts[0]) &&
      (parts[1] === 'pox' || parts[1] === 'pox-2') // todo: what's the new pox called?
    ) {
      return parts;
    }

    throw new Error('Stacking contract ID is malformed');
  }
}
