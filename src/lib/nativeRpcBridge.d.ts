export {};

declare global {
  interface Window {
    /** Optional acknowledgement callback; does not replace busApGpsUpdate. */
    busApRpcResult?: (payload: unknown) => void;
  }
}