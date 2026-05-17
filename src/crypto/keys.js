import 'react-native-get-random-values'; // <-- THIS MUST BE LINE 1
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, decodeUTF8 } from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';

const KEY_STORAGE_NAME = 'IN_ERUPEE_V2_KEY';
let WALLET_KEYPAIR = null;

// ── Secure Key Management ──────────────────────────────────────
export const initKeys = async () => {
  try {
    // 1. Check if we already have a key saved in hardware
    const savedKeyBase64 = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
    
    if (savedKeyBase64) {
      // Restore existing wallet
      const secretKey = decodeBase64(savedKeyBase64);
      WALLET_KEYPAIR = nacl.sign.keyPair.fromSecretKey(secretKey);
      console.log('✅ Existing wallet identity restored from Secure Enclave.');
    } else {
      // Create new wallet and lock it in hardware
      WALLET_KEYPAIR = nacl.sign.keyPair();
      await SecureStore.setItemAsync(KEY_STORAGE_NAME, encodeBase64(WALLET_KEYPAIR.secretKey));
      console.log('🚀 New wallet identity generated and secured.');
    }
    return WALLET_KEYPAIR;
  } catch (error) {
    console.error('Failed to initialize secure keys:', error);
    return null;
  }
};

export const getPublicKey = () => {
  if (!WALLET_KEYPAIR) throw new Error("Wallet not initialized yet!");
  return encodeBase64(WALLET_KEYPAIR.publicKey);
};

// ── Crypto Helpers ─────────────────────────────────────────────
export const signPayment = (payload) => {
  if (!WALLET_KEYPAIR) throw new Error("Wallet not initialized yet!");
  
  // Convert JSON string to raw Uint8Array byte stream using decodeUTF8
  const msg = decodeUTF8(JSON.stringify(payload));
  const sig = nacl.sign.detached(msg, WALLET_KEYPAIR.secretKey);
  
  return { 
    ...payload, 
    signature: encodeBase64(sig),
    pubKey: encodeBase64(WALLET_KEYPAIR.publicKey)
  };
};

export const verifyPayment = (signed) => {
  try {
    const { signature, pubKey, ...payload } = signed;
    return nacl.sign.detached.verify(
      decodeUTF8(JSON.stringify(payload)), // Convert string back to byte stream
      decodeBase64(signature),
      decodeBase64(pubKey)
    );
  } catch { 
    return false;
  }
};