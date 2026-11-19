import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { NETWORK, USDC_ASSET } from "../config";
import { usdcStringToUnits } from "./money";
import { signWithFreighter } from "./wallet";

export interface AccountStatus {
  /** false until the account has been created on testnet (e.g. by Friendbot). */
  funded: boolean;
  xlm: string;
  /** USDC balance in base units, or null if the account has no USDC trustline. */
  usdc: bigint | null;
}

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export async function fetchAccountStatus(address: string): Promise<AccountStatus> {
  const res = await fetch(`${NETWORK.horizonUrl}/accounts/${encodeURIComponent(address)}`);
  if (res.status === 404) return { funded: false, xlm: "0", usdc: null };
  if (!res.ok) throw new Error(`Horizon returned ${res.status}`);
  const data = (await res.json()) as { balances: HorizonBalance[] };
  const xlm = data.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  const usdc = data.balances.find(
    (b) => b.asset_code === USDC_ASSET.code && b.asset_issuer === USDC_ASSET.issuer,
  );
  return { funded: true, xlm, usdc: usdc ? usdcStringToUnits(usdc.balance) : null };
}

/** Creates and funds a testnet account with 10,000 test XLM. */
export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`${NETWORK.friendbotUrl}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error("Friendbot could not fund this account. Try again in a minute.");
}

/** Adds a USDC trustline so the wallet can hold, send, and receive test USDC. */
export async function addUsdcTrustline(address: string): Promise<string> {
  const server = new Horizon.Server(NETWORK.horizonUrl);
  const account = await server.loadAccount(address);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset(USDC_ASSET.code, USDC_ASSET.issuer) }))
    .setTimeout(120)
    .build();
  const { signedTxXdr } = await signWithFreighter(tx.toXDR(), {
    networkPassphrase: NETWORK.passphrase,
    address,
  });
  const result = await server.submitTransaction(TransactionBuilder.fromXDR(signedTxXdr, NETWORK.passphrase));
  return result.hash;
}
