/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CREDENCE_CONTRACT_ID?: string;
  readonly VITE_USDC_ISSUER?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_HORIZON_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
