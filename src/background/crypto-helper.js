var KEY_STORAGE_KEY = 'cryptoKeyMaterial';

async function getOrCreateKey() {
  var stored = await chrome.storage.local.get(KEY_STORAGE_KEY);
  var raw = stored[KEY_STORAGE_KEY];

  if (raw) {
    return crypto.subtle.importKey('raw', base64ToBytes(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  var key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  var exported = await crypto.subtle.exportKey('raw', key);
  var payload = {};
  payload[KEY_STORAGE_KEY] = bytesToBase64(new Uint8Array(exported));
  await chrome.storage.local.set(payload);
  return key;
}

function bytesToBase64(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encrypts an arbitrary JSON-serializable value.
 * @param {*} value
 * @returns {Promise<{iv: string, data: string}>} base64-encoded envelope
 */
export async function encryptJson(value) {
  var key = await getOrCreateKey();
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var plaintext = new TextEncoder().encode(JSON.stringify(value));
  var ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ciphertext)) };
}

/**
 * Decrypts an envelope produced by encryptJson(). Returns `fallback` if the
 * envelope is missing/malformed, or if decryption fails for any reason
 * (e.g. the key material was reset) instead of throwing and breaking the
 * whole settings page.
 * @param {{iv: string, data: string}|undefined} envelope
 * @param {*} fallback
 * @returns {Promise<*>}
 */
export async function decryptJson(envelope, fallback) {
  if (!envelope || !envelope.data || !envelope.iv) return fallback;
  try {
    var key = await getOrCreateKey();
    var iv = base64ToBytes(envelope.iv);
    var ciphertext = base64ToBytes(envelope.data);
    var plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (err) {
    console.error('Failed to decrypt stored secrets, falling back to defaults.', err);
    return fallback;
  }
}